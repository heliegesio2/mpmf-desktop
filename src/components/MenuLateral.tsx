"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AjusteFonte from "@/components/AjusteFonte";
import Logo from "@/components/Logo";
import { esquecerCarrinho, useCarrinho } from "@/lib/carrinho";

const ITENS = [
  { href: "/", rotulo: "Consultar preço", descricao: "Fale ou digite" },
  { href: "/venda", rotulo: "Venda", descricao: "Ditar itens e fechar" },
  { href: "/vendas", rotulo: "Vendas do dia", descricao: "Histórico por data, valor e pagamento" },
  { href: "/produtos", rotulo: "Produtos", descricao: "Incluir, alterar, excluir" },
  { href: "/caixa", rotulo: "Caixa", descricao: "Valor final do dia" },
  { href: "/gastos", rotulo: "Gastos", descricao: "Contas pagas da loja" },
];

export default function MenuLateral() {
  const caminho = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [contaAberta, setContaAberta] = useState(false);
  const { itens: itensCarrinho } = useCarrinho();

  useEffect(() => {
    setAberto(false);
    setContaAberta(false);
  }, [caminho]);

  async function trancar() {
    await fetch("/api/trava", { method: "DELETE" });
    esquecerCarrinho();
    router.replace("/entrar");
    router.refresh();
  }

  if (caminho.startsWith("/entrar")) return null;

  return (
    <>
      <Link
        href="/venda"
        className="atalho-venda"
        data-ativo={caminho === "/venda"}
        aria-label="Abrir a venda"
        title="Venda"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 4h2l2.3 12.2a1 1 0 0 0 1 .8h9.1a1 1 0 0 0 1-.8L21 8H6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="20" r="1.5" fill="currentColor" />
          <circle cx="17" cy="20" r="1.5" fill="currentColor" />
        </svg>
        {itensCarrinho.length > 0 && (
          <span className="atalho-venda-contador">{itensCarrinho.length}</span>
        )}
      </Link>

      <button
        type="button"
        className="conta-topo"
        onClick={() => setContaAberta((v) => !v)}
        aria-label="Menu"
        aria-expanded={contaAberta}
      >
        <span className="conta-iniciais" aria-hidden="true">PDV</span>
      </button>

      {contaAberta && (
        <>
          <div className="fundo-conta" onClick={() => setContaAberta(false)} />
          <div className="conta-menu" role="menu">
            <div className="conta-menu-cabeca">
              <strong>PDV Já</strong>
              <span>sem internet · dados só neste PC</span>
            </div>
            <div className="conta-menu-fonte">
              <span>Tamanho da letra</span>
              <AjusteFonte />
            </div>
            <div className="conta-menu-acoes">
              <Link href="/config" role="menuitem" data-ativo={caminho === "/config"}>
                Configurações
              </Link>
              <button type="button" role="menuitem" onClick={trancar}>
                Trancar
              </button>
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        className="abrir-menu"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        aria-expanded={aberto}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>

      {aberto && <div className="fundo-menu" onClick={() => setAberto(false)} />}

      <nav className="menu" data-aberto={aberto} aria-label="Seções">
        <Link href="/" className="menu-logo" aria-label="PDV Já">
          <Logo />
        </Link>

        <div className="menu-grupos">
          {ITENS.map((p) => (
            <Link key={p.href} href={p.href} className="menu-item" data-ativo={caminho === p.href}>
              <strong>{p.rotulo}</strong>
              <span>{p.descricao}</span>
            </Link>
          ))}
        </div>

        <button type="button" className="fechar-menu" onClick={() => setAberto(false)}>
          Fechar
        </button>
      </nav>
    </>
  );
}
