import { NextResponse } from "next/server";
import { gerarBrCode } from "@/lib/pix";
import { lerConfig } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * POST /api/pix  { valor, txid }
 *
 * Gera o "Pix copia e cola" (QR estático) a partir da chave salva em
 * Configurações. Sem integração com banco: a confirmação é manual, o caixa
 * confere o comprovante antes de finalizar a venda.
 */
export async function POST(request: Request) {
  const { erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  const { valor, txid } = await request.json();
  if (!Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
  }

  try {
    const chave = (await lerConfig("pix_chave"))?.trim();
    if (!chave) {
      return NextResponse.json(
        { erro: "Configure a chave Pix em Configurações." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      copiaECola: gerarBrCode({
        chave,
        valor,
        nome: (await lerConfig("pix_nome"))?.trim() || "RECEBEDOR",
        cidade: (await lerConfig("cidade"))?.trim() || "SAO PAULO",
        txid,
      }),
    });
  } catch (e) {
    console.error("Falha ao gerar o Pix:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível gerar o Pix.", detalhe }, { status: 500 });
  }
}
