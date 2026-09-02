import { NextResponse } from "next/server";
import { lerConfig, gravarConfig } from "@/lib/db";
import { conferirSenha, gerarHashSenha } from "@/lib/senha";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/config -> dados da loja para a tela de Configurações. */
export async function GET() {
  const { erro } = await exigirEmpresa();
  if (erro) return erro;

  return NextResponse.json({
    nome_loja: (await lerConfig("nome_loja")) ?? "",
    pix_chave: (await lerConfig("pix_chave")) ?? "",
    pix_nome: (await lerConfig("pix_nome")) ?? "",
    cidade: (await lerConfig("cidade")) ?? "",
  });
}

/** PUT /api/config -> grava os dados da loja. */
export async function PUT(request: Request) {
  const { erro } = await exigirEmpresa();
  if (erro) return erro;

  const c = await request.json().catch(() => ({}));

  await gravarConfig("nome_loja", String(c.nome_loja ?? "").trim());
  await gravarConfig("pix_chave", String(c.pix_chave ?? "").trim());
  await gravarConfig("pix_nome", String(c.pix_nome ?? "").trim());
  await gravarConfig("cidade", String(c.cidade ?? "").trim());

  return NextResponse.json({ ok: true });
}

/** PATCH /api/config -> troca o PIN. { pinAtual, pinNovo } */
export async function PATCH(request: Request) {
  const { erro } = await exigirEmpresa();
  if (erro) return erro;

  const { pinAtual, pinNovo } = await request.json().catch(() => ({}));
  const hash = await lerConfig("pin_hash");

  if (hash && !(await conferirSenha(String(pinAtual ?? ""), hash))) {
    return NextResponse.json({ erro: "PIN atual incorreto." }, { status: 401 });
  }
  if (!/^\d{4,8}$/.test(String(pinNovo ?? ""))) {
    return NextResponse.json({ erro: "O novo PIN precisa ter de 4 a 8 números." }, { status: 400 });
  }

  await gravarConfig("pin_hash", await gerarHashSenha(String(pinNovo)));
  return NextResponse.json({ ok: true });
}
