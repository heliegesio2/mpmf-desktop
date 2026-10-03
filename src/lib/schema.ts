/**
 * Schema do banco local — versão desktop, uma loja só.
 * É PostgreSQL de verdade (PGlite), então quase tudo é igual ao da nuvem.
 * Diferenças: sem extensão `unaccent`/`pg_trgm` (f_unaccent via translate,
 * busca fuzzy feita em JS), sem tabelas de multi-empresa/login social.
 *
 * Tudo idempotente (IF NOT EXISTS) — roda a cada abertura.
 */

export const SCHEMA = /* sql */ `
-- tira acento sem depender de extensão
CREATE OR REPLACE FUNCTION f_unaccent(t text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT translate(lower($1),
    'áàãâäéèêëíìîïóòõôöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn')
$$;

CREATE TABLE IF NOT EXISTS config (
  chave text PRIMARY KEY,
  valor text
);

CREATE TABLE IF NOT EXISTS empresa (
  id                bigserial PRIMARY KEY,
  nome              text NOT NULL,
  documento         text,
  telefone          text,
  telefone_whatsapp boolean NOT NULL DEFAULT false,
  cidade            text,
  cep               text,
  endereco          text,
  horario           text,
  pix_chave         text,
  pix_nome          text,
  situacao          text NOT NULL DEFAULT 'aprovada',
  criada_em         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS produto (
  id           bigserial PRIMARY KEY,
  empresa_id   bigint NOT NULL DEFAULT 1,
  codigo       text,
  nome         text NOT NULL,
  categoria    text,
  local        text,
  unidade      text NOT NULL DEFAULT 'unidade',
  tipo_venda   text NOT NULL DEFAULT 'unidade',
  preco        numeric(10,2) NOT NULL DEFAULT 0,
  preco_compra numeric(10,2) NOT NULL DEFAULT 0,
  preco_embalagem numeric(10,2),
  estoque      numeric(12,3) NOT NULL DEFAULT 0,
  estoque_minimo numeric(12,3),
  estoque_minimo_embalagem text,
  foto         text,
  ativo        boolean NOT NULL DEFAULT true,
  observacao   text,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  alterado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_produto_ativo ON produto (empresa_id, ativo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_codigo ON produto (empresa_id, codigo) WHERE codigo IS NOT NULL;

CREATE TABLE IF NOT EXISTS caixa (
  id         bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL DEFAULT 1,
  data       date NOT NULL DEFAULT CURRENT_DATE,
  valor      numeric(10,2) NOT NULL CHECK (valor >= 0),
  criado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, data)
);

CREATE TABLE IF NOT EXISTS custo (
  id           bigserial PRIMARY KEY,
  empresa_id   bigint NOT NULL DEFAULT 1,
  descricao    text NOT NULL,
  beneficiario text NOT NULL,
  valor        numeric(10,2) NOT NULL CHECK (valor > 0),
  criado_em    timestamptz NOT NULL DEFAULT now()
);

-- registro de vendas (o /vendas). "data" e a data LOCAL do balcao.
CREATE TABLE IF NOT EXISTS venda (
  id         bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL DEFAULT 1,
  data       date NOT NULL DEFAULT CURRENT_DATE,
  total      numeric(10,2) NOT NULL DEFAULT 0,
  qtd_itens  integer NOT NULL DEFAULT 0,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venda_empresa_data ON venda (empresa_id, data DESC, criado_em DESC);

CREATE TABLE IF NOT EXISTS venda_item (
  id         bigserial PRIMARY KEY,
  venda_id   bigint NOT NULL REFERENCES venda(id) ON DELETE CASCADE,
  produto_id bigint,
  nome       text NOT NULL,
  quantidade numeric(12,3) NOT NULL,
  preco_unit numeric(10,2) NOT NULL,
  tipo_venda text NOT NULL DEFAULT 'unidade'
);
CREATE INDEX IF NOT EXISTS idx_venda_item_venda ON venda_item (venda_id);

CREATE TABLE IF NOT EXISTS venda_pagamento (
  id       bigserial PRIMARY KEY,
  venda_id bigint NOT NULL REFERENCES venda(id) ON DELETE CASCADE,
  forma    text NOT NULL,
  valor    numeric(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_venda_pagamento_venda ON venda_pagamento (venda_id);

-- log de vendas excluídas (quem, quando, snapshot)
CREATE TABLE IF NOT EXISTS venda_exclusao (
  id             bigserial PRIMARY KEY,
  empresa_id     bigint NOT NULL,
  venda_id       bigint NOT NULL,
  venda_data     date,
  venda_criado_em timestamptz,
  total          numeric(10,2) NOT NULL DEFAULT 0,
  itens          jsonb NOT NULL DEFAULT '[]',
  pagamentos     jsonb NOT NULL DEFAULT '[]',
  usuario_id     bigint,
  usuario_nome   text NOT NULL,
  excluido_em    timestamptz NOT NULL DEFAULT now()
);

-- anotacoes (lembretes com data de alerta)
CREATE TABLE IF NOT EXISTS anotacao (
  id          bigserial PRIMARY KEY,
  empresa_id  bigint NOT NULL DEFAULT 1,
  texto       text NOT NULL,
  data_alerta date,
  concluida   boolean NOT NULL DEFAULT false,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_anotacao_empresa ON anotacao (empresa_id, concluida, data_alerta);

CREATE TABLE IF NOT EXISTS casco (
  id                bigserial PRIMARY KEY,
  empresa_id        bigint NOT NULL DEFAULT 1,
  responsavel       text NOT NULL,
  telefone          text NOT NULL,
  telefone_whatsapp boolean NOT NULL DEFAULT false,
  endereco          text NOT NULL,
  quantidade        integer NOT NULL CHECK (quantidade > 0),
  devolvido         boolean NOT NULL DEFAULT false,
  devolvido_em      timestamptz,
  criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cliente (
  id         bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL DEFAULT 1,
  nome       text NOT NULL,
  cpf        text,
  telefone   text,
  whatsapp   boolean NOT NULL DEFAULT false,
  endereco   text NOT NULL,
  cep        text,
  nota       integer,
  foto       text NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fiado (
  id         bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL DEFAULT 1,
  cliente_id bigint NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  valor      numeric(10,2) NOT NULL CHECK (valor > 0),
  descricao  text,
  pago       boolean NOT NULL DEFAULT false,
  pago_em    timestamptz,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fornecedor (
  id                bigserial PRIMARY KEY,
  empresa_id        bigint NOT NULL DEFAULT 1,
  nome              text NOT NULL,
  documento         text,
  telefone          text,
  telefone_whatsapp boolean NOT NULL DEFAULT false,
  endereco          text,
  observacao        text,
  pix_chave         text,
  criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conta_pagar (
  id            bigserial PRIMARY KEY,
  empresa_id    bigint NOT NULL DEFAULT 1,
  fornecedor_id bigint REFERENCES fornecedor(id) ON DELETE SET NULL,
  categoria     text,
  descricao     text,
  valor         numeric(12,2) NOT NULL CHECK (valor > 0),
  vencimento    date,
  foto          text,
  recorrente    boolean NOT NULL DEFAULT false,
  pago          boolean NOT NULL DEFAULT false,
  pago_em       timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
`;
