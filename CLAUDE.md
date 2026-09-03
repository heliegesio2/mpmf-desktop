# CLAUDE.md — mpmf-desktop

Versão **offline, para Windows** do PDV Já. Cópia adaptada de `../mpmf-app` (o app
da nuvem). Mesmo produto, mesma UI em português; muda a infra.

## Comandos

```bash
npm run dev        # Next em :3131 + Electron (concurrently)
npm run next:dev   # só o Next, :3131 (útil pra testar API com curl)
npm run next:build # build standalone
npm run dist       # next:build + electron-builder --win --x64 -> dist/*.exe
npm run typecheck  # tsc --noEmit
```

Sem testes, sem linter (eslint desligado no build).

## Diferenças estruturais vs. `mpmf-app` (o que quebra ao copiar código de lá)

- **Banco = PGlite** (Postgres em WASM, roda no processo Node do Next standalone).
  `src/lib/pglite.ts` expõe um shim `pool` com a cara do `pg` (`query`, `connect`).
  `getPool()` é o que `db.ts` usa. Um `PGlite` só, cacheado em `globalThis._pglite`.
- **Sem `pg_trgm` / `unaccent`.** `f_unaccent` é uma função SQL feita com `translate()`
  (ver `src/lib/schema.ts`). A busca fuzzy de produto é **JavaScript** em
  `src/lib/db.ts` (`buscarProduto`: Jaccard de trigramas + prefixo/substring/código).
  Toda query nova tem que evitar essas extensões.
- **Uma loja só.** `EMPRESA_ID = 1` fixo. `src/lib/sessao.ts` (`exigirEmpresa`,
  `exigirSessao`) devolve sempre `empresaId: 1` — nunca lê do corpo. As rotas de API
  copiadas de `mpmf-app` funcionam sem mudança por causa disso.
- **Auth = trava por PIN.** `src/lib/trava.ts` (cookie HMAC Web Crypto, igual espírito
  do `auth.ts` da nuvem). Segredo vem de `PDVJA_TRAVA_SECRET` (o Electron gera e
  guarda em `<userData>/dados/trava.key`); em dev, um fixo. PIN é hash scrypt
  (`src/lib/senha.ts`, Node) guardado em `config.pin_hash`.
  `src/middleware.ts` libera só `/entrar`, `/api/trava`, `/api/saude`.
- **Schema** = `src/lib/schema.ts` (uma string SQL, tudo `CREATE ... IF NOT EXISTS`),
  aplicada a cada abertura em `abrir()`. Não há `db/NN_*.sql` nem `garantirSchema()`
  (existe como no-op pra compatibilidade). Mudança de schema entra direto no `schema.ts`.
- **`config`** é uma tabela chave/valor: `pin_hash`, `pix_chave`, `pix_nome`, `cidade`,
  `nome_loja`. `lerConfig`/`gravarConfig` em `db.ts`.
- **Venda concluída**: `fechar()` em `/venda` faz `POST /api/venda/concluir` com o carrinho +
  `data` (data local) → (1) `registrarVenda` grava `venda`+`venda_item`+`venda_pagamento`;
  (2) `baixarEstoqueVenda` (`GREATEST(0, estoque - qtd)`, nunca negativo). Ambos não-bloqueantes.
  Devolve `estoques` ({id: {estoque, critico}}); o comprovante mostra um chip de estoque embaixo
  do nome de cada item (`.chip-estoque-venda`, vermelho só se crítico). Espelha o web.
- **`/vendas`**: histórico. Dois `<input type="date">` (De/Até, padrão = hoje local),
  `GET /api/vendas?de=&ate=` → `listarVendas` (filtra por `venda.data`, `json_agg` dos
  pagamentos). No menu como "Vendas do dia".
- **`/produtos`**: o chip de estoque (`.botao-estoque`, âmbar sólido quando baixo) abre um
  campo inline ao tocar → `PATCH /api/produtos/:id {estoque}` → `atualizarEstoqueProduto`.
  O link "📦 Atualizar estoque por foto" foi removido (é visão, não veio pro offline).
- **Campo estoque**: o banco devolve `numeric` como `"3.000"`. `FormularioProduto` carrega
  `estoque` como `String(Number(p.estoque))` e manda de volta como **texto cru** — nunca
  `moedaParaNumero` (apaga o ponto: `"3.000"` → `3000`).

## Empacotamento (Electron)

- `electron/main.js` — em produção dá `fork` no `app.asar/.next/standalone/server.js`
  (`PORT=3131`, `HOSTNAME=127.0.0.1`, passa `PDVJA_DATA_DIR` e `PDVJA_TRAVA_SECRET`),
  espera `/api/saude`, carrega numa `BrowserWindow`. Menu **Arquivo** faz backup/restore
  copiando a pasta `<userData>/dados` (recursivo, `fs.cpSync`); restore renomeia a
  pasta atual pra `dados-antigo-<ts>` e dá `app.relaunch()`.
- `package.json > build`: `files` inclui `.next/standalone`, `.next/static` e
  **`node_modules/@electric-sql/pglite/**`** (senão o `require` do standalone não
  acha o pacote); `asarUnpack` tira o pglite e o standalone do asar (WASM precisa
  estar em disco). Ícone: `build/icon.ico`.
- `next.config.ts`: `output: "standalone"`, `serverExternalPackages: ["@electric-sql/pglite"]`.

## O que NÃO veio pra cá

Voz por microfone continua no código (telas de venda/consulta/caixa/config), mas a
Web Speech API precisa de internet — offline, é só digitar. Ficaram de fora: rotas de
visão/IA (ler nota, contar estoque por foto), fiado, clientes, relatórios,
fornecedores, contas a pagar, login social, multi-empresa, admin.
