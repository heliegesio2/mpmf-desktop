# PDV Já — versão para computador (sem internet)

O mesmo PDV Já, empacotado como programa de Windows para funcionar **offline**, no
computador do balcão. Um instalador `.exe`, sem servidor, sem nuvem.

- **Banco de dados local**: PostgreSQL de verdade rodando embutido
  ([PGlite](https://pglite.dev), WASM). Grava numa pasta do computador.
- **Uma loja só**, sem cadastro de empresa, sem super admin, sem papéis.
  O acesso é um **PIN** de 4 a 8 números, criado no primeiro uso.
- **Os dados nunca saem do PC.** Backup é manual (menu **Arquivo → Fazer backup**).

## O que funciona offline

| Tela | Offline? | Observação |
|------|----------|------------|
| Consultar preço | ✅ | busca fuzzy feita em JavaScript (sem `pg_trgm`) |
| Venda | ✅ | dinheiro / débito / crédito / Pix; pagamento dividido; troco |
| Produtos (incluir/editar/excluir, foto) | ✅ | |
| Caixa (fechamento do dia) | ✅ | |
| Gastos | ✅ | |
| Configurações (loja, chave Pix, trocar PIN) | ✅ | |
| QR Pix na venda | ✅ | gerado da chave em Configurações (BR Code, sem banco) |
| **Ditar por voz** (microfone) | ❌ | a Web Speech API usa servidores do Google — **precisa de internet**. Sem rede, é só digitar. |
| Ler nota / contar estoque por foto (IA) | ❌ | não incluído nesta versão |
| Fiado / clientes / relatórios / fornecedores / contas a pagar | ❌ | fora do escopo da versão offline |

## Rodar em desenvolvimento

```bash
npm install
npm run dev          # sobe o Next em :3131 e abre o Electron
```

O banco de dev fica em `./.pgdata-dev` (ignorado pelo git). Apague a pasta para
começar do zero.

## Gerar o instalador

```bash
npm run dist
```

Sai em `dist/PDV Ja Setup <versão>.exe` (NSIS, x64). O instalador deixa escolher a
pasta e cria atalhos no Desktop e no Menu Iniciar.

### Onde os dados ficam depois de instalado

`%APPDATA%\PDV Ja\dados\` — contém:
- `pgdata/` — o banco PostgreSQL (PGlite)
- `trava.key` — segredo local que assina o cookie do PIN (um por PC)

O menu **Ajuda → Onde ficam meus dados** abre essa pasta.

### Backup e restauração

- **Arquivo → Fazer backup dos dados…** copia a pasta `dados\` inteira para onde
  você escolher (um pen drive, outra pasta).
- **Arquivo → Restaurar backup…** troca os dados atuais pelos do backup e
  reinicia o sistema. Os dados de antes são guardados em
  `%APPDATA%\PDV Ja\dados-antigo-<carimbo>\` por segurança.

O PIN viaja junto com o backup (está no `trava.key`).

## Como se relaciona com o app da nuvem (`mpmf-app`)

Este projeto é uma **cópia adaptada**, não um fork vivo. O código de telas,
`lib/voz`, `lib/moeda`, `lib/falaVenda`, `lib/pix`, componentes de foto etc. foi
copiado de `mpmf-app`. As diferenças que importam:

| | `mpmf-app` (nuvem) | `mpmf-desktop` |
|---|---|---|
| Banco | Postgres/Neon via `pg` | PGlite (WASM) via um shim `pool` (`src/lib/pglite.ts`) |
| Multi-tenant | sim (`empresa_id` da sessão) | não — `EMPRESA_ID = 1` fixo |
| Auth | sessão HMAC + senha/OAuth | trava por PIN (`src/lib/trava.ts`) |
| Busca de produto | `buscar_produto` (SQL, `pg_trgm`) | JS (Jaccard de trigramas) em `src/lib/db.ts` |
| Migrações | `db/NN_*.sql` + `garantirSchema()` | `src/lib/schema.ts` (um `CREATE ... IF NOT EXISTS` só, roda a cada abertura) |
| Empacotamento | Vercel | Electron + Next `output: "standalone"` |

Ao trazer uma correção de `mpmf-app` para cá, confira esses pontos — em especial
qualquer query nova (tem que passar pelo shim e não pode usar `pg_trgm`/`unaccent`).
