"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pdvja", {
  /** Recebe ações do menu do app (backup, restaurar). */
  aoReceberAcao: (cb) => {
    const h = (_e, acao) => cb(acao);
    ipcRenderer.on("acao", h);
    return () => ipcRenderer.removeListener("acao", h);
  },
});
