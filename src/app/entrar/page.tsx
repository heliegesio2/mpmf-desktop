"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

export default function Entrar() {
  const router = useRouter();
  const [definido, setDefinido] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/trava")
      .then((r) => r.json())
      .then((d) => setDefinido(Boolean(d.definido)))
      .catch(() => setDefinido(true));
  }, []);

  useEffect(() => {
    campo.current?.focus();
  }, [definido]);

  const criando = definido === false;
  const valido = criando ? /^\d{4,8}$/.test(pin) && pin === pin2 : pin.length >= 4;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/trava", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(criando ? { novoPin: pin } : { pin }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não foi possível entrar.");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível entrar.");
      setPin("");
      setPin2("");
      setEnviando(false);
    }
  }

  return (
    <main className="tela-pin">
      <form className="cartao-pin" onSubmit={enviar}>
        <Logo className="grande" />

        {definido === null ? (
          <p className="vazio">Abrindo…</p>
        ) : (
          <>
            <h1 className="titulo-cartao" style={{ margin: 0 }}>
              {criando ? "Crie um PIN" : "Digite o PIN"}
            </h1>
            <p className="dica" style={{ margin: 0 }}>
              {criando
                ? "De 4 a 8 números. É ele que abre o sistema neste computador."
                : "É o PIN que você cadastrou aqui."}
            </p>

            <input
              ref={campo}
              className="pin-input"
              inputMode="numeric"
              type="password"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              aria-label="PIN"
            />
            {criando && (
              <input
                className="pin-input"
                inputMode="numeric"
                type="password"
                maxLength={8}
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
                placeholder="repita"
                aria-label="Repita o PIN"
              />
            )}

            <button className="botao primario grande" disabled={!valido || enviando}>
              {enviando ? "…" : criando ? "Salvar e entrar" : "Entrar"}
            </button>

            {erro && (
              <p className="dica" data-erro="true" style={{ margin: 0 }}>
                {erro}
              </p>
            )}
          </>
        )}
      </form>
    </main>
  );
}
