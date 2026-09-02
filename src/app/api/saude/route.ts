import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Usada pelo Electron pra saber que o servidor já subiu. */
export async function GET() {
  return NextResponse.json({ ok: true });
}
