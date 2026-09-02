import { NextResponse } from "next/server";
import { lerConfig, gravarConfig } from "@/lib/db";
import { conferirSenha, gerarHashSenha } from "@/lib/senha";
import { COOKIE_TRAVA, criarTokenTrava } from "@/lib/trava";

export const dynamic = "force-dynamic";

/** GET /api/trava -> { definido } (já existe um PIN?) */
export async function GET() {
  const hash = await lerConfig("pin_hash");
  return NextResponse.json({ definido: Boolean(hash) });
}

/**
 * POST /api/trava
 *  - sem PIN ainda: { novoPin } cria o PIN e destrava
 *  - com PIN: { pin } confere e destrava
 */
export async function POST(request: Request) {
  const c = await request.json().catch(() => ({}));
  const hash = await lerConfig("pin_hash");

  if (!hash) {
    const novo = String(c.novoPin ?? "").trim();
    if (!/^\d{4,8}$/.test(novo)) {
      return NextResponse.json({ erro: "O PIN precisa ter de 4 a 8 números." }, { status: 400 });
    }
    await gravarConfig("pin_hash", await gerarHashSenha(novo));
  } else {
    const pin = String(c.pin ?? "");
    if (!(await conferirSenha(pin, hash))) {
      return NextResponse.json({ erro: "PIN incorreto." }, { status: 401 });
    }
  }

  const { token, expiraEm } = await criarTokenTrava();
  const resp = NextResponse.json({ ok: true });
  resp.cookies.set(COOKIE_TRAVA, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiraEm,
  });
  return resp;
}

/** DELETE /api/trava -> tranca de novo (logout). */
export async function DELETE() {
  const resp = NextResponse.json({ ok: true });
  resp.cookies.set(COOKIE_TRAVA, "", { path: "/", maxAge: 0 });
  return resp;
}
