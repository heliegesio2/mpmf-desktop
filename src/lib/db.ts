/**
 * Camada de dados — versão desktop. Mesmo formato de retorno do app da nuvem,
 * mas rodando no PGlite local e sem escopo de multi-empresa (uma loja só).
 */

import { getPool, EMPRESA_ID } from "./pglite";

/** No app da nuvem isto roda as migrações; aqui o schema já veio pronto. */
export async function garantirSchema(): Promise<void> {}

// ---------- produtos ----------

export type Produto = {
  id: number;
  nome: string;
  categoria: string | null;
  local: string | null;
  unidade: string;
  tipo_venda: string;
  preco: string;
  preco_compra: string;
  estoque: string;
  estoque_minimo: string | null;
  estoque_minimo_embalagem: string | null;
  preco_embalagem: string | null;
  tem_foto?: boolean;
  score?: number;
};

export type ProdutoEntrada = {
  nome: string;
  categoria?: string | null;
  local?: string | null;
  unidade?: string;
  tipoVenda: string;
  preco: number;
  precoCompra: number;
  estoque: number;
  estoqueMinimo?: number | null;
  estoqueMinimoEmbalagem?: string | null;
  precoEmbalagem?: number | null;
  foto?: string;
};

const CAMPOS =
  "id, nome, categoria, local, unidade, tipo_venda, preco, preco_compra, estoque, " +
  "estoque_minimo, estoque_minimo_embalagem, preco_embalagem, (foto IS NOT NULL) AS tem_foto";

function semAcento(t: string): string {
  return (t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function trigramas(t: string): Set<string> {
  const s = "  " + semAcento(t).replace(/\s+/g, " ") + " ";
  const g = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) g.add(s.slice(i, i + 3));
  return g;
}

function similaridade(a: string, b: string): number {
  const ta = trigramas(a);
  const tb = trigramas(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}

type LinhaProduto = Produto & { codigo: string | null; foto_existe?: boolean };

/**
 * Busca fuzzy do produto (tolerante a acento e erro de transcrição da voz).
 * Feita em JS porque o catálogo de uma loja é pequeno.
 */
export async function buscarProduto(
  _empresaId: number,
  termo: string,
  limite = 8
): Promise<Produto[]> {
  const pool = await getPool();
  const t = semAcento(termo);
  const palavras = t.split(" ").filter(Boolean);
  if (!palavras.length) return [];

  const { rows } = await pool.query<LinhaProduto & { codigo: string | null }>(
    `SELECT ${CAMPOS}, codigo FROM produto WHERE ativo AND empresa_id = $1`,
    [EMPRESA_ID]
  );

  const pontuados = rows
    .map((p) => {
      const alvo = semAcento(`${p.nome} ${p.categoria ?? ""} ${p.local ?? ""}`);
      const nomeSA = semAcento(p.nome);
      const codigoBate = p.codigo != null && p.codigo === termo.trim();
      const todasPalavras = palavras.every((w) => alvo.includes(w));
      const sim = similaridade(nomeSA, t);
      const score = Math.max(
        codigoBate ? 1 : 0,
        nomeSA.startsWith(t) ? 0.95 : 0,
        alvo.includes(t) ? 0.85 : 0,
        todasPalavras ? 0.7 : 0,
        sim
      );
      const entra = codigoBate || alvo.includes(t) || todasPalavras || sim > 0.22;
      return { p: { ...p, score: Number(score.toFixed(3)) }, score, entra };
    })
    .filter((x) => x.entra)
    .sort((a, b) => b.score - a.score || a.p.nome.localeCompare(b.p.nome))
    .slice(0, limite)
    .map((x) => {
      const { codigo, ...rest } = x.p as LinhaProduto & { codigo: string | null };
      void codigo;
      return rest as Produto;
    });

  return pontuados;
}

export async function produtoPorId(_empresaId: number, id: number): Promise<Produto | null> {
  const pool = await getPool();
  const { rows } = await pool.query<Produto>(
    `SELECT ${CAMPOS} FROM produto WHERE id = $1 AND empresa_id = $2`,
    [id, EMPRESA_ID]
  );
  return rows[0] ?? null;
}

export async function listarProdutos(_empresaId: number, termo = ""): Promise<Produto[]> {
  const pool = await getPool();
  const t = termo.trim();
  if (!t) {
    const { rows } = await pool.query<Produto>(
      `SELECT ${CAMPOS} FROM produto WHERE ativo AND empresa_id = $1 ORDER BY nome`,
      [EMPRESA_ID]
    );
    return rows;
  }
  const { rows } = await pool.query<Produto>(
    `SELECT ${CAMPOS} FROM produto
      WHERE ativo AND empresa_id = $1
        AND f_unaccent(nome || ' ' || coalesce(categoria,'')) LIKE '%' || f_unaccent($2) || '%'
      ORDER BY nome`,
    [EMPRESA_ID, t]
  );
  return rows;
}

export async function criarProduto(_empresaId: number, p: ProdutoEntrada): Promise<Produto> {
  const pool = await getPool();
  const { rows } = await pool.query<Produto>(
    `INSERT INTO produto
       (empresa_id, nome, categoria, local, unidade, tipo_venda, preco, preco_compra, estoque,
        estoque_minimo, estoque_minimo_embalagem, foto, preco_embalagem)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING ${CAMPOS}`,
    [
      EMPRESA_ID, p.nome, p.categoria ?? null, p.local ?? null, p.unidade ?? "unidade",
      p.tipoVenda, p.preco, p.precoCompra, p.estoque,
      p.estoqueMinimo ?? null, p.estoqueMinimoEmbalagem ?? null, p.foto ? p.foto : null,
      p.precoEmbalagem ?? null,
    ]
  );
  return rows[0];
}

export async function atualizarProduto(
  _empresaId: number,
  id: number,
  p: ProdutoEntrada
): Promise<Produto | null> {
  const pool = await getPool();
  const foto = p.foto === undefined ? null : p.foto;
  const { rows } = await pool.query<Produto>(
    `UPDATE produto
        SET nome = $3, categoria = $4, local = $5, unidade = $6,
            tipo_venda = $7, preco = $8, preco_compra = $9, estoque = $10,
            estoque_minimo = $12, estoque_minimo_embalagem = $13, preco_embalagem = $14,
            foto = CASE WHEN $11::text IS NULL THEN foto WHEN $11 = '' THEN NULL ELSE $11 END,
            alterado_em = now()
      WHERE id = $1 AND empresa_id = $2
      RETURNING ${CAMPOS}`,
    [
      id, EMPRESA_ID, p.nome, p.categoria ?? null, p.local ?? null,
      p.unidade ?? "unidade", p.tipoVenda, p.preco, p.precoCompra, p.estoque, foto,
      p.estoqueMinimo ?? null, p.estoqueMinimoEmbalagem ?? null, p.precoEmbalagem ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function atualizarEstoqueProduto(
  _empresaId: number,
  id: number,
  novoEstoque: number
): Promise<Produto | null> {
  const pool = await getPool();
  const { rows } = await pool.query<Produto>(
    `UPDATE produto SET estoque = $3, alterado_em = now()
      WHERE id = $1 AND empresa_id = $2 RETURNING ${CAMPOS}`,
    [id, EMPRESA_ID, novoEstoque]
  );
  return rows[0] ?? null;
}

/** So mexe no preco de venda — usado pela atualizacao por video. */
export async function atualizarPrecoProduto(
  _empresaId: number,
  id: number,
  novoPreco: number
): Promise<Produto | null> {
  const pool = await getPool();
  const { rows } = await pool.query<Produto>(
    `UPDATE produto SET preco = $3, alterado_em = now()
      WHERE id = $1 AND empresa_id = $2 RETURNING ${CAMPOS}`,
    [id, EMPRESA_ID, novoPreco]
  );
  return rows[0] ?? null;
}

/**
 * Dá baixa no estoque dos itens vendidos ao fechar a venda. `GREATEST(0, ...)`
 * para não deixar o estoque negativo. Não há livro de vendas — é o único
 * registro que a venda deixa.
 */
export type EstoqueRestante = { estoque: number; critico: boolean };

/** `estoque <= estoque_minimo ?? 3` -> nível de reposição. */
const LIMIAR_ESTOQUE_PADRAO = 3;

export async function baixarEstoqueVenda(
  _empresaId: number,
  itens: { id: number; quantidade: number }[]
): Promise<Record<number, EstoqueRestante>> {
  const pool = await getPool();
  const restante: Record<number, EstoqueRestante> = {};
  for (const it of itens) {
    if (!Number.isInteger(it.id) || !(it.quantidade > 0)) continue;
    const { rows } = await pool.query<{ id: number; estoque: string; estoque_minimo: string | null }>(
      `UPDATE produto SET estoque = GREATEST(0, estoque - $3), alterado_em = now()
        WHERE id = $1 AND empresa_id = $2
        RETURNING id, estoque, estoque_minimo`,
      [it.id, EMPRESA_ID, it.quantidade]
    );
    const r = rows[0];
    if (r) {
      const estoque = Number(r.estoque);
      const limite = r.estoque_minimo != null ? Number(r.estoque_minimo) : LIMIAR_ESTOQUE_PADRAO;
      restante[Number(r.id)] = { estoque, critico: estoque <= limite };
    }
  }
  return restante;
}

// ---------- vendas (registro pós-fechamento — o /vendas) ----------

export type ItemVendaEntrada = {
  id?: number | null;
  nome: string;
  quantidade: number;
  precoUnit: number;
  tipoVenda?: string;
};
export type ParteVendaEntrada = { forma: string; valor: number };

/** Grava uma venda concluída (cabeçalho + itens + pagamentos). `data` = data local do balcão. */
export async function registrarVenda(
  _empresaId: number,
  dados: { data?: string | null; itens: ItemVendaEntrada[]; partes: ParteVendaEntrada[] }
): Promise<number> {
  const pool = await getPool();
  const total = dados.itens.reduce((s, it) => s + it.quantidade * it.precoUnit, 0);

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO venda (empresa_id, data, total, qtd_itens)
     VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4) RETURNING id`,
    [EMPRESA_ID, dados.data || null, Number(total.toFixed(2)), dados.itens.length]
  );
  const vendaId = rows[0].id;

  for (const it of dados.itens) {
    await pool.query(
      `INSERT INTO venda_item (venda_id, produto_id, nome, quantidade, preco_unit, tipo_venda)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        vendaId,
        Number.isInteger(it.id as number) ? it.id : null,
        String(it.nome ?? "").slice(0, 200) || "Item",
        it.quantidade,
        it.precoUnit,
        it.tipoVenda || "unidade",
      ]
    );
  }
  for (const p of dados.partes) {
    if (!(p.valor > 0)) continue;
    await pool.query(
      `INSERT INTO venda_pagamento (venda_id, forma, valor) VALUES ($1, $2, $3)`,
      [vendaId, String(p.forma ?? "").slice(0, 20) || "dinheiro", p.valor]
    );
  }
  return Number(vendaId);
}

export type VendaResumo = {
  id: number;
  data: string;
  criado_em: string;
  total: number;
  qtd_itens: number;
  pagamentos: { forma: string; valor: number }[];
};

/** Vendas entre duas datas locais (inclusivo), mais recentes primeiro. */
export async function listarVendas(
  _empresaId: number,
  de: string,
  ate: string
): Promise<VendaResumo[]> {
  const pool = await getPool();
  const { rows } = await pool.query<VendaResumo>(
    `SELECT v.id,
            v.data::text AS data,
            v.criado_em,
            v.total::float8 AS total,
            v.qtd_itens,
            COALESCE(
              (SELECT json_agg(
                        json_build_object('forma', p.forma, 'valor', p.valor::float8)
                        ORDER BY p.id)
                 FROM venda_pagamento p WHERE p.venda_id = v.id),
              '[]'::json
            ) AS pagamentos
       FROM venda v
      WHERE v.empresa_id = $1 AND v.data >= $2::date AND v.data <= $3::date
      ORDER BY v.criado_em DESC`,
    [EMPRESA_ID, de, ate]
  );
  return rows;
}

export type ResultadoExclusaoVenda = "ok" | "nao_encontrada";

/**
 * Exclui uma venda: grava snapshot + quem excluiu em `venda_exclusao`,
 * devolve o estoque baixado e apaga a venda. O fiado lançado não é desfeito.
 */
export async function excluirVenda(
  _empresaId: number,
  vendaId: number,
  usuario: { id: number; nome: string }
): Promise<ResultadoExclusaoVenda> {
  const pool = await getPool();
  const { rows: log } = await pool.query(
    `INSERT INTO venda_exclusao
       (empresa_id, venda_id, venda_data, venda_criado_em, total, itens, pagamentos, usuario_id, usuario_nome)
     SELECT v.empresa_id, v.id, v.data, v.criado_em, v.total,
            COALESCE((SELECT json_agg(json_build_object(
                        'produto_id', i.produto_id, 'nome', i.nome,
                        'quantidade', i.quantidade::float8, 'preco_unit', i.preco_unit::float8,
                        'tipo_venda', i.tipo_venda) ORDER BY i.id)
                       FROM venda_item i WHERE i.venda_id = v.id), '[]'::json),
            COALESCE((SELECT json_agg(json_build_object('forma', p.forma, 'valor', p.valor::float8) ORDER BY p.id)
                       FROM venda_pagamento p WHERE p.venda_id = v.id), '[]'::json),
            $3, $4
       FROM venda v
      WHERE v.id = $1 AND v.empresa_id = $2
     RETURNING id`,
    [vendaId, EMPRESA_ID, usuario.id, usuario.nome.slice(0, 200)]
  );
  if (log.length === 0) return "nao_encontrada";

  const { rows: itens } = await pool.query<{ produto_id: number | null; quantidade: string }>(
    "SELECT produto_id, quantidade FROM venda_item WHERE venda_id = $1",
    [vendaId]
  );
  for (const it of itens) {
    if (it.produto_id == null) continue;
    await pool.query(
      `UPDATE produto SET estoque = estoque + $3, alterado_em = now()
        WHERE id = $1 AND empresa_id = $2`,
      [it.produto_id, EMPRESA_ID, Number(it.quantidade)]
    );
  }
  await pool.query("DELETE FROM venda WHERE id = $1 AND empresa_id = $2", [vendaId, EMPRESA_ID]);
  return "ok";
}

export type ExclusaoVenda = {
  id: number;
  venda_id: number;
  venda_data: string | null;
  venda_criado_em: string | null;
  total: number;
  itens: { nome: string; quantidade: number; preco_unit: number; tipo_venda: string }[];
  pagamentos: { forma: string; valor: number }[];
  usuario_nome: string;
  excluido_em: string;
};

/** Log de vendas excluídas da empresa, mais recentes primeiro (até 200). */
export async function listarExclusoesVenda(_empresaId: number): Promise<ExclusaoVenda[]> {
  const pool = await getPool();
  const { rows } = await pool.query<ExclusaoVenda>(
    `SELECT id, venda_id, venda_data::text AS venda_data, venda_criado_em, total::float8 AS total,
            itens, pagamentos, usuario_nome, excluido_em
       FROM venda_exclusao
      WHERE empresa_id = $1
      ORDER BY excluido_em DESC
      LIMIT 200`,
    [EMPRESA_ID]
  );
  return rows;
}

export async function fotoProduto(_empresaId: number, id: number): Promise<string | null> {
  const pool = await getPool();
  const { rows } = await pool.query<{ foto: string | null }>(
    "SELECT foto FROM produto WHERE id = $1 AND empresa_id = $2",
    [id, EMPRESA_ID]
  );
  return rows[0]?.foto ?? null;
}

export async function atualizarFotoProduto(
  _empresaId: number,
  id: number,
  dataUrl: string
): Promise<boolean> {
  const pool = await getPool();
  const r = await pool.query(
    "UPDATE produto SET foto = NULLIF($3,''), alterado_em = now() WHERE id = $1 AND empresa_id = $2",
    [id, EMPRESA_ID, dataUrl]
  );
  return r.rowCount > 0;
}

export async function excluirProduto(_empresaId: number, id: number): Promise<boolean> {
  const pool = await getPool();
  const r = await pool.query("DELETE FROM produto WHERE id = $1 AND empresa_id = $2", [id, EMPRESA_ID]);
  return r.rowCount > 0;
}

export type ProdutoBaixo = Produto & { aviso: string };
const LIMIAR_PADRAO = 3;

export async function produtosEstoqueBaixo(_empresaId: number): Promise<ProdutoBaixo[]> {
  const pool = await getPool();
  const { rows } = await pool.query<Produto>(
    `SELECT ${CAMPOS} FROM produto
      WHERE ativo AND empresa_id = $1
        AND estoque <= COALESCE(estoque_minimo, ${LIMIAR_PADRAO})
      ORDER BY estoque`,
    [EMPRESA_ID]
  );
  return rows.map((p) => ({
    ...p,
    aviso: `${p.nome} abaixo de ${p.estoque_minimo ?? LIMIAR_PADRAO} ${
      p.estoque_minimo_embalagem ?? "unidade"
    }(s)`,
  }));
}

// ---------- caixa (fechamento diário) ----------

export type Caixa = { id: number; data: string; valor: string; criado_em: string };

export async function listarCaixa(_empresaId: number, limite = 60): Promise<Caixa[]> {
  const pool = await getPool();
  const { rows } = await pool.query<Caixa>(
    `SELECT id, data::text AS data, valor, criado_em FROM caixa
      WHERE empresa_id = $1 ORDER BY data DESC LIMIT $2`,
    [EMPRESA_ID, limite]
  );
  return rows;
}

export async function criarCaixa(_empresaId: number, valor: number): Promise<Caixa> {
  const pool = await getPool();
  const { rows } = await pool.query<Caixa>(
    `INSERT INTO caixa (empresa_id, valor) VALUES ($1, $2)
     ON CONFLICT (empresa_id, data) DO UPDATE SET valor = EXCLUDED.valor, criado_em = now()
     RETURNING id, data::text AS data, valor, criado_em`,
    [EMPRESA_ID, valor]
  );
  return rows[0];
}

export async function excluirCaixa(_empresaId: number, id: number): Promise<boolean> {
  const pool = await getPool();
  const r = await pool.query("DELETE FROM caixa WHERE id = $1 AND empresa_id = $2", [id, EMPRESA_ID]);
  return r.rowCount > 0;
}

// ---------- gastos (custo) ----------

export type Custo = {
  id: number;
  descricao: string;
  beneficiario: string;
  valor: string;
  criado_em: string;
};

export async function listarCustos(_empresaId: number, limite = 100): Promise<Custo[]> {
  const pool = await getPool();
  const { rows } = await pool.query<Custo>(
    `SELECT id, descricao, beneficiario, valor, criado_em FROM custo
      WHERE empresa_id = $1 ORDER BY criado_em DESC LIMIT $2`,
    [EMPRESA_ID, limite]
  );
  return rows;
}

export async function criarCusto(
  _empresaId: number,
  descricao: string,
  beneficiario: string,
  valor: number
): Promise<Custo> {
  const pool = await getPool();
  const { rows } = await pool.query<Custo>(
    `INSERT INTO custo (empresa_id, descricao, beneficiario, valor)
     VALUES ($1, $2, $3, $4) RETURNING id, descricao, beneficiario, valor, criado_em`,
    [EMPRESA_ID, descricao, beneficiario, valor]
  );
  return rows[0];
}

export async function excluirCusto(_empresaId: number, id: number): Promise<boolean> {
  const pool = await getPool();
  const r = await pool.query("DELETE FROM custo WHERE id = $1 AND empresa_id = $2", [id, EMPRESA_ID]);
  return r.rowCount > 0;
}

// ---------- config (chave/valor: PIN, chave Pix, chave da IA) ----------

export async function lerConfig(chave: string): Promise<string | null> {
  const pool = await getPool();
  const { rows } = await pool.query<{ valor: string | null }>(
    "SELECT valor FROM config WHERE chave = $1",
    [chave]
  );
  return rows[0]?.valor ?? null;
}

export async function gravarConfig(chave: string, valor: string | null): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO config (chave, valor) VALUES ($1, $2)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [chave, valor]
  );
}

// ---------- anotacoes (lembretes com data de alerta) ----------

export type Anotacao = {
  id: number;
  texto: string;
  data_alerta: string | null;
  concluida: boolean;
  criado_em: string;
};

const CAMPOS_ANOTACAO = "id, texto, data_alerta::text AS data_alerta, concluida, criado_em";

export async function listarAnotacoes(_empresaId: number, situacao?: string): Promise<Anotacao[]> {
  const pool = await getPool();
  const filtro =
    situacao === "abertas" ? "AND concluida = false"
    : situacao === "concluidas" ? "AND concluida = true"
    : "";
  const { rows } = await pool.query<Anotacao>(
    `SELECT ${CAMPOS_ANOTACAO} FROM anotacao
      WHERE empresa_id = $1 ${filtro}
      ORDER BY concluida, (data_alerta IS NULL), data_alerta, criado_em DESC`,
    [EMPRESA_ID]
  );
  return rows;
}

export async function criarAnotacao(
  _empresaId: number,
  texto: string,
  dataAlerta: string | null
): Promise<Anotacao> {
  const pool = await getPool();
  const { rows } = await pool.query<Anotacao>(
    `INSERT INTO anotacao (empresa_id, texto, data_alerta)
     VALUES ($1, $2, $3::date) RETURNING ${CAMPOS_ANOTACAO}`,
    [EMPRESA_ID, texto, dataAlerta || null]
  );
  return rows[0];
}

export async function editarAnotacao(
  _empresaId: number,
  id: number,
  campos: { concluida?: boolean; texto?: string; dataAlerta?: string | null }
): Promise<Anotacao | null> {
  const pool = await getPool();
  const sets: string[] = [];
  const vals: unknown[] = [id, EMPRESA_ID];
  if (campos.concluida !== undefined) {
    vals.push(campos.concluida);
    sets.push(`concluida = $${vals.length}`);
  }
  if (campos.texto !== undefined) {
    vals.push(campos.texto);
    sets.push(`texto = $${vals.length}`);
  }
  if (campos.dataAlerta !== undefined) {
    vals.push(campos.dataAlerta || null);
    sets.push(`data_alerta = $${vals.length}::date`);
  }
  if (sets.length === 0) return null;
  const { rows } = await pool.query<Anotacao>(
    `UPDATE anotacao SET ${sets.join(", ")}
      WHERE id = $1 AND empresa_id = $2 RETURNING ${CAMPOS_ANOTACAO}`,
    vals
  );
  return rows[0] ?? null;
}

export async function excluirAnotacao(_empresaId: number, id: number): Promise<boolean> {
  const pool = await getPool();
  const r = await pool.query("DELETE FROM anotacao WHERE id = $1 AND empresa_id = $2", [id, EMPRESA_ID]);
  return r.rowCount > 0;
}

export async function anotacoesEmAlerta(_empresaId: number): Promise<number> {
  const pool = await getPool();
  const { rows } = await pool.query<{ total: string }>(
    `SELECT count(*)::int AS total FROM anotacao
      WHERE empresa_id = $1 AND concluida = false
        AND data_alerta IS NOT NULL AND data_alerta <= CURRENT_DATE`,
    [EMPRESA_ID]
  );
  return Number(rows[0]?.total ?? 0);
}
