/**
 * Versão desktop: uma loja só. As rotas de API pedem `empresaId` — aqui é
 * sempre 1. A autenticação de verdade é a trava por PIN (src/lib/trava.ts).
 */

import { NextResponse } from "next/server";
import { EMPRESA_ID } from "./pglite";

export async function exigirEmpresa(): Promise<{ empresaId: number; erro?: never }> {
  return { empresaId: EMPRESA_ID };
}

export async function exigirSessao(): Promise<{ sessao: { empresaId: number }; erro?: never }> {
  return { sessao: { empresaId: EMPRESA_ID } };
}

/** Compat com trechos que devolviam uma resposta de erro pronta. */
export function negar(msg: string, status = 403) {
  return NextResponse.json({ erro: msg }, { status });
}
