"use client";

import { useCallback, useEffect, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

type Dados = {
  nome_loja: string;
  pix_chave: string;
  pix_nome: string;
  cidade: string;
};

export default function Config() {
  const [d, setD] = useState<Dados>({ nome_loja: "", pix_chave: "", pix_nome: "", cidade: "" });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  const [pinAtual, setPinAtual] = useState("");
  const [pinNovo, setPinNovo] = useState("");
  const [pinNovo2, setPinNovo2] = useState("");
  const [trocandoPin, setTrocandoPin] = useState(false);
  const [avisoPin, setAvisoPin] = useState("");
  const [erroPin, setErroPin] = useState(false);

  // chaves de IA (estoque por vídeo) — o GET só diz se estão configuradas
  const [temAnthropic, setTemAnthropic] = useState(false);
  const [temTranscricao, setTemTranscricao] = useState(false);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [transcricaoKey, setTranscricaoKey] = useState("");

  const campo = (k: keyof Dados) => (v: string) => setD((x) => ({ ...x, [k]: v }));

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const k = campoAtual.current as keyof Dados | null;
      if (!k) return;
      setD((x) => ({ ...x, [k]: k === "pix_chave" ? texto.trim() : capitalizar(texto) }));
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/config");
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setD({
        nome_loja: dados.nome_loja ?? "",
        pix_chave: dados.pix_chave ?? "",
        pix_nome: dados.pix_nome ?? "",
        cidade: dados.cidade ?? "",
      });
      setTemAnthropic(Boolean(dados.tem_anthropic));
      setTemTranscricao(Boolean(dados.tem_transcricao));
    } catch {
      setErro(true);
      setAviso("Não foi possível carregar as configurações.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...d,
          ...(anthropicKey.trim() ? { anthropic_key: anthropicKey.trim() } : {}),
          ...(transcricaoKey.trim() ? { transcricao_key: transcricaoKey.trim() } : {}),
        }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");
      setAviso("Configurações salvas.");
      setAnthropicKey("");
      setTranscricaoKey("");
      await carregar();
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const pinValido = /^\d{4,8}$/.test(pinNovo) && pinNovo === pinNovo2;

  async function trocarPin() {
    if (!pinValido || trocandoPin) return;
    setTrocandoPin(true);
    setErroPin(false);
    try {
      const r = await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinAtual, pinNovo }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível trocar o PIN.");
      setAvisoPin("PIN trocado. Use o novo PIN na próxima vez que abrir o sistema.");
      setPinAtual("");
      setPinNovo("");
      setPinNovo2("");
    } catch (e) {
      setErroPin(true);
      setAvisoPin(e instanceof Error ? e.message : "Não foi possível trocar o PIN.");
    } finally {
      setTrocandoPin(false);
    }
  }

  if (carregando) return <main className="tela"><p className="vazio">Carregando…</p></main>;

  return (
    <main className="tela">
      <header className="marca">Configurações</header>

      <section className="cartao">
        <h2 className="titulo-cartao">Dados da loja</h2>

        <div className="grade-form">
          <CampoVoz
            rotulo="Nome da loja"
            placeholder="Mercadinho do bairro"
            largo
            campo="nome_loja"
            valor={d.nome_loja}
            aoMudar={campo("nome_loja")}
            ouvindo={ouvindoCampo === "nome_loja"}
            temVoz={disponivel}
            aoOuvir={ouvir}
            aoParar={parar}
          />
          <CampoVoz
            rotulo="Cidade (para o Pix)"
            placeholder="São Paulo"
            campo="cidade"
            valor={d.cidade}
            aoMudar={campo("cidade")}
            ouvindo={ouvindoCampo === "cidade"}
            temVoz={disponivel}
            aoOuvir={ouvir}
            aoParar={parar}
          />
        </div>
      </section>

      <section className="cartao">
        <h2 className="titulo-cartao">Pix</h2>
        <p className="ajuda-voz">
          A chave usada para gerar o QR na tela de Venda. Sem ela, o botão Pix avisa que falta configurar.
        </p>

        <div className="grade-form">
          <CampoVoz
            rotulo="Chave Pix"
            placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
            largo
            campo="pix_chave"
            valor={d.pix_chave}
            aoMudar={campo("pix_chave")}
            ouvindo={ouvindoCampo === "pix_chave"}
            temVoz={disponivel}
            aoOuvir={ouvir}
            aoParar={parar}
          />
          <CampoVoz
            rotulo="Nome do recebedor"
            placeholder="Como aparece na conta"
            largo
            campo="pix_nome"
            valor={d.pix_nome}
            aoMudar={campo("pix_nome")}
            ouvindo={ouvindoCampo === "pix_nome"}
            temVoz={disponivel}
            aoOuvir={ouvir}
            aoParar={parar}
          />
        </div>

        <div className="acoes">
          <button className="botao primario" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar configurações"}
          </button>
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>

      <section className="cartao">
        <h2 className="titulo-cartao">Estoque por vídeo (precisa de internet)</h2>
        <p className="ajuda-voz">
          Pra usar “Atualizar estoque por vídeo” em Produtos. A transcrição usa a Groq
          (console.groq.com — barato) e a leitura usa a Anthropic (console.anthropic.com).
          As chaves ficam só neste computador.
        </p>

        <div className="grade-form">
          <label className="rotulo largo">
            Chave da Anthropic {temAnthropic && <span className="ok-config">✓ configurada</span>}
            <span className="entrada">
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder={temAnthropic ? "•••••••• (deixe em branco pra manter)" : "sk-ant-..."}
                autoComplete="off"
              />
            </span>
          </label>
          <label className="rotulo largo">
            Chave da transcrição (Groq) {temTranscricao && <span className="ok-config">✓ configurada</span>}
            <span className="entrada">
              <input
                type="password"
                value={transcricaoKey}
                onChange={(e) => setTranscricaoKey(e.target.value)}
                placeholder={temTranscricao ? "•••••••• (deixe em branco pra manter)" : "gsk_..."}
                autoComplete="off"
              />
            </span>
          </label>
        </div>

        <div className="acoes">
          <button className="botao primario" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar chaves"}
          </button>
        </div>
      </section>

      <section className="cartao">
        <h2 className="titulo-cartao">Trocar o PIN</h2>
        <p className="ajuda-voz">É o número que abre o sistema neste computador. De 4 a 8 dígitos.</p>

        <div className="grade-form">
          <label className="rotulo">
            PIN atual
            <span className="entrada">
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pinAtual}
                onChange={(e) => setPinAtual(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                autoComplete="off"
              />
            </span>
          </label>
          <label className="rotulo">
            Novo PIN
            <span className="entrada">
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pinNovo}
                onChange={(e) => setPinNovo(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                autoComplete="off"
              />
            </span>
          </label>
          <label className="rotulo">
            Repita o novo PIN
            <span className="entrada">
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pinNovo2}
                onChange={(e) => setPinNovo2(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                autoComplete="off"
              />
            </span>
          </label>
        </div>

        <div className="acoes">
          <button className="botao primario" onClick={trocarPin} disabled={!pinValido || trocandoPin}>
            {trocandoPin ? "Trocando…" : "Trocar PIN"}
          </button>
        </div>

        <p className="dica" data-erro={erroPin} role="status" aria-live="polite">
          {avisoPin}
        </p>
      </section>
    </main>
  );
}
