/**
 * Versão desktop: igual à da nuvem, mas as chaves (Anthropic + transcrição)
 * vêm da tabela `config` (setadas em Configurações), com fallback pro ambiente.
 * O recurso precisa de internet — offline não funciona.
 *
 * O lojista grava um vídeo falando, produto por produto, o NOME e um ou dois
 * números: a QUANTIDADE em estoque e/ou o PREÇO de venda.
 */

import Anthropic from "@anthropic-ai/sdk";
import { lerConfig } from "./db";

const MODELO = process.env.ANTHROPIC_MODEL_VIDEO || "claude-sonnet-5";

export type ItemEstoqueVideo = {
  nome: string;
  quantidade: number | null;
  preco: number | null;
  generico: boolean;
  segundos: number;
};

async function chaveAnthropic(): Promise<string> {
  return (
    (await lerConfig("anthropic_key"))?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim() ||
    ""
  );
}
async function chaveTranscricao(): Promise<{ key: string; url: string; modelo: string }> {
  return {
    key: (await lerConfig("transcricao_key"))?.trim() || process.env.TRANSCRICAO_API_KEY?.trim() || "",
    url:
      (await lerConfig("transcricao_url"))?.trim() ||
      process.env.TRANSCRICAO_URL?.trim() ||
      "https://api.groq.com/openai/v1/audio/transcriptions",
    modelo:
      (await lerConfig("transcricao_modelo"))?.trim() ||
      process.env.TRANSCRICAO_MODELO?.trim() ||
      "whisper-large-v3-turbo",
  };
}

export async function transcricaoConfigurada(): Promise<boolean> {
  const t = await chaveTranscricao();
  return Boolean(t.key) && Boolean(await chaveAnthropic());
}

type Segmento = { start: number; text: string };

export async function transcreverAudio(
  audio: Blob
): Promise<{ texto: string; segmentos: Segmento[] }> {
  const { key, url, modelo } = await chaveTranscricao();
  if (!key) {
    throw new Error("A transcrição de áudio não está configurada (veja Configurações).");
  }

  const form = new FormData();
  form.append("file", audio, "audio.wav");
  form.append("model", modelo);
  form.append("language", "pt");
  form.append("response_format", "verbose_json");

  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    throw new Error(`Falha na transcrição (${r.status}). ${detalhe.slice(0, 200)}`);
  }

  const j = (await r.json()) as { text?: string; segments?: { start: number; text: string }[] };
  const segmentos = (j.segments ?? []).map((s) => ({
    start: Number(s.start) || 0,
    text: String(s.text ?? "").trim(),
  }));
  return { texto: (j.text ?? segmentos.map((s) => s.text).join(" ")).trim(), segmentos };
}

const SCHEMA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome do produto; se ininteligível, deduza e dê um nome genérico." },
          quantidade: { type: "number", description: "Quantidade em estoque falada (número solto, 'pacotes', 'dúzia'=12). -1 se não falou." },
          preco: { type: "number", description: "Preço em reais quando falado ('R$', 'reais', 'centavos'->0.5, 'a dúzia'). -1 se não falou." },
          generico: { type: "boolean", description: "true quando o nome foi deduzido." },
          segundos: { type: "number", description: "Segundo do vídeo em que o produto aparece (do [N]). -1 se não tiver." },
        },
        required: ["nome", "quantidade", "preco", "generico", "segundos"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `A transcrição abaixo é de um vídeo onde o dono de um mercadinho brasileiro passa
produto por produto contando o ESTOQUE. Para cada produto ele fala o NOME e um ou dois números:
a QUANTIDADE em estoque e, às vezes, também o PREÇO de venda.
Exemplos: "Batata Mix, 12 pacotes" (só quantidade). "Paçoquinha, 50 centavos" (só preço).
"Arroz, 8 sacos, R$ 25" (quantidade e preço). Cada linha começa com "[N]" = o segundo do vídeo.

Regras pra separar os números:
- Tem "R$", "reais", "real", "centavos", ou "a dúzia"/"o quilo" -> é PREÇO.
- Número solto, "unidades", "pacotes", "caixas", "uma dúzia" (=12), "meia dúzia" (=6) -> é QUANTIDADE.

Para cada produto:
- "nome": marca + tipo. Corrija erros óbvios de transcrição. Se a fala estiver truncada ou
  ininteligível, DEDUZA o produto mais provável e dê um nome curto e genérico ("generico": true).
- "quantidade": número. -1 se não falou quantidade.
- "preco": número em reais. -1 se não falou preço.
- "generico": true só quando o nome foi deduzido.
- "segundos": o "[N]" do começo da linha. -1 se não houver.

Não invente produtos. Ignore saudações e ruído.

Transcrição:
"""
{{TRANSCRICAO}}
"""`;

export async function interpretarTranscricao(
  segmentos: Segmento[],
  textoCru: string
): Promise<ItemEstoqueVideo[]> {
  const corpo =
    segmentos.length > 0
      ? segmentos.map((s) => `[${Math.round(s.start)}] ${s.text}`).join("\n")
      : textoCru;
  if (!corpo.trim()) return [];

  const anthropic = new Anthropic({ apiKey: await chaveAnthropic() });
  const resposta = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 4000,
    messages: [{ role: "user", content: INSTRUCAO.replace("{{TRANSCRICAO}}", corpo.slice(0, 8000)) }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const bloco = resposta.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") throw new Error("O modelo não devolveu texto.");

  const json = JSON.parse(bloco.text) as { itens: ItemEstoqueVideo[] };
  const limpo = (n: unknown): number | null => {
    const v = Number(n);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  return json.itens
    .map((i) => ({
      nome: String(i.nome ?? "").trim(),
      quantidade: limpo(i.quantidade),
      preco: limpo(i.preco),
      generico: Boolean(i.generico),
      segundos: Number.isFinite(Number(i.segundos)) ? Number(i.segundos) : -1,
    }))
    .filter((i) => i.nome.length >= 2 && (i.quantidade !== null || i.preco !== null));
}

export async function lerEstoqueDoVideo(
  audio: Blob
): Promise<{ transcricao: string; itens: ItemEstoqueVideo[] }> {
  const { texto, segmentos } = await transcreverAudio(audio);
  const itens = await interpretarTranscricao(segmentos, texto);
  return { transcricao: texto, itens };
}
