/**
 * Banco local: PostgreSQL rodando embutido (PGlite, WASM), gravado numa
 * pasta do computador. Sem servidor, sem instalar nada.
 *
 * O resto do código usa `pool` como se fosse o `pg` — mesma assinatura
 * (`pool.query(texto, params)` -> `{ rows }`, `pool.connect()` p/ transação).
 */

import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { SCHEMA } from "./schema";

export const EMPRESA_ID = 1; // versão desktop: uma loja só

function pastaDados(): string {
  const base = process.env.PDVJA_DATA_DIR;
  if (base) return path.join(base, "pgdata");
  // dev / fora do Electron
  return path.join(process.cwd(), ".pgdata-dev");
}

type Linhas<T> = { rows: T[]; rowCount: number };
export type Pool = {
  query: <T = Record<string, unknown>>(texto: string, params?: unknown[]) => Promise<Linhas<T>>;
  connect: () => Promise<{
    query: <T = Record<string, unknown>>(texto: string, params?: unknown[]) => Promise<Linhas<T>>;
    release: () => void;
  }>;
};

async function consultar<T>(db: PGlite, texto: string, params: unknown[]): Promise<Linhas<T>> {
  const r = await db.query(texto, params);
  return { rows: r.rows as T[], rowCount: (r.rows?.length ?? 0) || (r.affectedRows ?? 0) };
}

declare global {
  // eslint-disable-next-line no-var
  var _pglite: Promise<{ db: PGlite; pool: Pool }> | undefined;
}

async function abrir(): Promise<{ db: PGlite; pool: Pool }> {
  const db = await PGlite.create(pastaDados());
  await db.exec(SCHEMA);

  // garante a loja única
  await db.query(
    `INSERT INTO empresa (id, nome, situacao) VALUES ($1, 'Meu mercadinho', 'aprovada')
     ON CONFLICT (id) DO NOTHING`,
    [EMPRESA_ID]
  );
  // sequência do id não pode colidir com o id 1 já inserido
  await db.exec(`SELECT setval(pg_get_serial_sequence('empresa','id'),
                               GREATEST((SELECT max(id) FROM empresa), 1))`);

  const pool: Pool = {
    query: (texto, params = []) => consultar(db, texto, params),
    connect: async () => ({
      query: (texto, params = []) => consultar(db, texto, params),
      release: () => {},
    }),
  };

  return { db, pool };
}

export async function conexao(): Promise<{ db: PGlite; pool: Pool }> {
  if (!globalThis._pglite) globalThis._pglite = abrir();
  return globalThis._pglite;
}

/** Atalho: só o `pool` (o que o db.ts usa). */
export async function getPool(): Promise<Pool> {
  return (await conexao()).pool;
}
