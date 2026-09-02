/**
 * Trava por PIN. Cookie assinado com HMAC (Web Crypto, funciona no middleware).
 * O segredo vem do Electron (arquivo local, um por PC); em dev usa um fixo.
 */

export const COOKIE_TRAVA = "pdvja_ok";
const DIAS = 30;

function segredo(): string {
  return process.env.PDVJA_TRAVA_SECRET || "dev-pdvja-trava-secret-nao-use-em-producao";
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deB64url(t: string): Uint8Array<ArrayBuffer> {
  const b64 = t.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}
async function chave(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function criarTokenTrava(): Promise<{ token: string; expiraEm: Date }> {
  const exp = Math.floor(Date.now() / 1000) + DIAS * 86400;
  const corpo = b64url(new TextEncoder().encode(JSON.stringify({ exp })));
  const sig = await crypto.subtle.sign("HMAC", await chave(), new TextEncoder().encode(corpo));
  return { token: `${corpo}.${b64url(new Uint8Array(sig))}`, expiraEm: new Date(exp * 1000) };
}

export async function travaValida(token?: string | null): Promise<boolean> {
  if (!token) return false;
  const [corpo, sig] = token.split(".");
  if (!corpo || !sig) return false;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await chave(),
      deB64url(sig),
      new TextEncoder().encode(corpo)
    );
    if (!ok) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(deB64url(corpo)));
    return exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
