"use strict";

const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const { fork } = require("child_process");

const DEV_URL = process.env.ELECTRON_START_URL;
const PORT = 3131;

// pasta onde o banco local e a config ficam gravados (fora do app, sobrevive à atualização)
const DATA_DIR = path.join(app.getPath("userData"), "dados");
fs.mkdirSync(DATA_DIR, { recursive: true });

/** Segredo local pra assinar o cookie da trava (fica só neste PC). */
function segredoTrava() {
  const arq = path.join(DATA_DIR, "trava.key");
  try {
    return fs.readFileSync(arq, "utf8").trim();
  } catch {
    const s = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(arq, s, { mode: 0o600 });
    return s;
  }
}
const TRAVA_SECRET = segredoTrava();

let janela = null;
let servidor = null;

/** Copia uma pasta inteira (recursivo). Node 16.7+. */
function copiarPasta(de, para) {
  fs.cpSync(de, para, { recursive: true });
}

function pararServidor() {
  try {
    servidor?.kill();
  } catch {
    /* já morreu */
  }
  servidor = null;
}

/** Backup: copia a pasta de dados para um lugar escolhido pelo usuário. */
async function fazerBackup() {
  const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const escolha = await dialog.showSaveDialog(janela, {
    title: "Salvar backup do PDV Já",
    defaultPath: `pdvja-backup-${carimbo}`,
    buttonLabel: "Salvar backup",
    properties: ["createDirectory"],
  });
  if (escolha.canceled || !escolha.filePath) return;

  try {
    copiarPasta(DATA_DIR, escolha.filePath);
    await dialog.showMessageBox(janela, {
      type: "info",
      title: "Backup pronto",
      message: "Backup salvo com sucesso.",
      detail: escolha.filePath,
    });
  } catch (e) {
    dialog.showErrorBox("PDV Já", "Não foi possível salvar o backup.\n\n" + (e?.message || e));
  }
}

/** Restaurar: substitui a pasta de dados por um backup e reinicia o sistema. */
async function restaurarBackup() {
  const escolha = await dialog.showOpenDialog(janela, {
    title: "Escolher backup para restaurar",
    buttonLabel: "Restaurar",
    properties: ["openDirectory"],
  });
  if (escolha.canceled || !escolha.filePaths?.[0]) return;

  const origem = escolha.filePaths[0];
  if (!fs.existsSync(path.join(origem, "pgdata")) && !fs.existsSync(path.join(origem, "trava.key"))) {
    dialog.showErrorBox("PDV Já", "Essa pasta não parece um backup do PDV Já.");
    return;
  }

  const confirma = await dialog.showMessageBox(janela, {
    type: "warning",
    buttons: ["Cancelar", "Restaurar e reiniciar"],
    defaultId: 1,
    cancelId: 0,
    title: "Restaurar backup",
    message: "Isso substitui todos os dados atuais pelos do backup.",
    detail: "O sistema vai reiniciar. Os dados de agora serão guardados em uma pasta ao lado, por segurança.",
  });
  if (confirma.response !== 1) return;

  try {
    pararServidor();
    const reserva = `${DATA_DIR}-antigo-${Date.now()}`;
    if (fs.existsSync(DATA_DIR)) fs.renameSync(DATA_DIR, reserva);
    copiarPasta(origem, DATA_DIR);
    app.relaunch();
    app.exit(0);
  } catch (e) {
    dialog.showErrorBox("PDV Já", "Não foi possível restaurar o backup.\n\n" + (e?.message || e));
  }
}

/** Sobe o servidor Next standalone (só em produção). */
function iniciarServidor() {
  return new Promise((resolve, reject) => {
    if (DEV_URL) return resolve(DEV_URL);

    // com asar:false, os arquivos do Next standalone ficam achatados em resources/app
    const cwd = path.join(process.resourcesPath, "app");
    const serverJs = path.join(cwd, "server.js");

    servidor = fork(serverJs, [], {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
        PDVJA_DATA_DIR: DATA_DIR,
        PDVJA_TRAVA_SECRET: TRAVA_SECRET,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    servidor.stdout?.on("data", (d) => console.log("[next]", d.toString().trim()));
    servidor.stderr?.on("data", (d) => console.error("[next]", d.toString().trim()));
    servidor.on("error", reject);

    esperarServidor(PORT, 60)
      .then(() => resolve(`http://127.0.0.1:${PORT}`))
      .catch(reject);
  });
}

function esperarServidor(porta, tentativas) {
  return new Promise((resolve, reject) => {
    const tenta = (n) => {
      const req = http.get({ host: "127.0.0.1", port: porta, path: "/api/saude", timeout: 1500 }, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => (n <= 0 ? reject(new Error("servidor não respondeu")) : setTimeout(() => tenta(n - 1), 1000)));
      req.on("timeout", () => {
        req.destroy();
        n <= 0 ? reject(new Error("timeout")) : setTimeout(() => tenta(n - 1), 1000);
      });
    };
    tenta(tentativas);
  });
}

async function criarJanela() {
  janela = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a1712",
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  janela.once("ready-to-show", () => janela.show());

  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  try {
    const url = await iniciarServidor();
    await janela.loadURL(url);
  } catch (e) {
    dialog.showErrorBox("PDV Já", "Não foi possível iniciar o sistema.\n\n" + (e?.message || e));
    app.quit();
  }
}

function montarMenu() {
  const template = [
    {
      label: "Arquivo",
      submenu: [
        {
          label: "Fazer backup dos dados…",
          click: () => fazerBackup(),
        },
        {
          label: "Restaurar backup…",
          click: () => restaurarBackup(),
        },
        { type: "separator" },
        { role: "quit", label: "Sair" },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Desfazer" },
        { role: "redo", label: "Refazer" },
        { type: "separator" },
        { role: "cut", label: "Recortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Colar" },
        { role: "selectAll", label: "Selecionar tudo" },
      ],
    },
    {
      label: "Exibir",
      submenu: [
        { role: "reload", label: "Recarregar" },
        { role: "resetZoom", label: "Zoom normal" },
        { role: "zoomIn", label: "Aumentar zoom" },
        { role: "zoomOut", label: "Diminuir zoom" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Tela cheia" },
      ],
    },
    {
      label: "Ajuda",
      submenu: [
        {
          label: "Onde ficam meus dados",
          click: () => shell.openPath(DATA_DIR),
        },
        {
          label: "Sobre o PDV Já",
          click: () =>
            dialog.showMessageBox(janela, {
              type: "info",
              title: "PDV Já",
              message: "PDV Já — versão para computador",
              detail:
                "Funciona sem internet. Os dados ficam só neste computador.\n\n" +
                "Versão " + app.getVersion(),
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const soUma = app.requestSingleInstanceLock();
if (!soUma) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });

  app.whenReady().then(() => {
    montarMenu();
    criarJanela();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
  });
}

app.on("window-all-closed", () => {
  servidor?.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => servidor?.kill());
