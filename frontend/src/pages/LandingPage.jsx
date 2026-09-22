import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, CalendarDays, ChartPie, Coins, Download, Languages,
  Layers, LayoutDashboard, Menu, Moon, Receipt, Repeat, Wallet, X
} from "lucide-react";
import { BRAND_MARK_SRC } from "../app/constants.js";
import "./landing.css";

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    text: "Saldo de hoje, fechamento previsto, histórico e a fatia de cada categoria no mês.",
    wide: true
  },
  {
    icon: CalendarDays,
    title: "Controle mensal",
    text: "Passado, mês atual e futuro em cards e tabela, com lançamento avulso, recorrente ou em lote."
  },
  {
    icon: Receipt,
    title: "Faturas",
    text: "Cartões com vencimento, itens, modelos e o status de paga ou em aberto."
  },
  {
    icon: Layers,
    title: "Parcelamentos",
    text: "A compra dividida entra no mês certo e continua ligada à fatura."
  },
  {
    icon: Wallet,
    title: "Carteiras",
    text: "Conta, dinheiro, reserva e investimento, cada um com o próprio saldo."
  },
  {
    icon: ChartPie,
    title: "Orçamento",
    text: "Limite por categoria, renda planejada e a reserva que você quer guardar."
  },
  {
    icon: Coins,
    title: "Recebíveis",
    text: "O que vão te pagar, com pagamento parcial e vínculo ao gasto de origem.",
    wide: true
  }
];

const STORIES = [
  {
    index: "01",
    title: "O mês deixa de ser uma lista solta.",
    text: "Cada período mostra o que já entrou, o que saiu e como o saldo deve fechar. O mês atual separa o saldo de agora do fechamento previsto. Os próximos meses já carregam o que é recorrente.",
    points: ["Cards para passado, presente e futuro", "Tabela do dia a dia, com recorrência", "Atalho para lançar sem sair do mês"],
    src: "/landing/print-meses.png",
    alt: "Controle mensal do Kashy365 com a tabela de lançamentos, ganhos, gastos e saldo do mês",
    caption: "Controle mensal: o que já aconteceu, o saldo de agora e a projeção do que vem.",
    label: "Meses"
  },
  {
    index: "02",
    title: "A fatura do cartão para de surpreender.",
    text: "Cada cartão tem vencimento, itens e total. Dá para marcar como paga, ajustar a data e acompanhar o que ainda está em aberto sem misturar com o dinheiro da conta.",
    points: ["Modelos de cartão para repetir a estrutura", "Itens, categorias e compras parceladas", "Status em aberto ou paga"],
    src: "/landing/print-faturas.png",
    alt: "Faturas do Kashy365 com totais, vencimento e a ação de marcar como paga",
    caption: "Faturas: vencimento, detalhamento e o que ainda falta pagar.",
    label: "Faturas",
    flip: true
  },
  {
    index: "03",
    title: "Simule a compra antes de ela existir.",
    text: "O simulador é o ensaio do mês. Você testa uma parcela, um gasto à vista ou uma receita, compara com o cenário real e só grava no sistema quando decidir inserir os itens.",
    points: ["Cenários salvos, sem mexer nos lançamentos", "Comparação entre o real e a simulação", "Inserção só do que você confirmar"],
    src: "/landing/print-simulador.png",
    alt: "Simulador do Kashy365 com itens simulados, saldo projetado e a comparação com o cenário real",
    caption: "Simulador: teste receitas e gastos e compare com o cenário real antes de lançar.",
    label: "Simulador"
  }
];

const EXTRAS = [
  { icon: Repeat, title: "Recorrência e lote", text: "Salário, aluguel e uma leva de lançamentos entram uma vez e seguem o calendário." },
  { icon: Download, title: "Exportação CSV", text: "Leve o mês para uma planilha quando quiser conferir ou arquivar." },
  { icon: Moon, title: "Tema claro e escuro", text: "A mesma leitura de saldo, no claro do dia ou no escuro da noite." },
  { icon: Languages, title: "Português e inglês", text: "A interface acompanha o idioma, sem mudar a lógica do mês." }
];

const STEPS = [
  { n: "01", title: "Comece pelo que você tem", text: "Crie a conta com um saldo único ou separe logo as carteiras. Dá para ajustar depois." },
  { n: "02", title: "Coloque o mês na mesa", text: "Lance ganhos, gastos, faturas, parcelas e o que ainda vão te pagar." },
  { n: "03", title: "Olhe antes de comprar", text: "Acompanhe o fechamento previsto e simule a próxima decisão sem gravar nada." }
];

const FAQ = [
  {
    q: "O que é o Kashy365?",
    a: "É um controle financeiro pessoal na web. Ele junta saldo, projeção de fechamento, meses, faturas, parcelamentos, carteiras, orçamento por categoria e valores a receber. O simulador deixa testar uma compra antes de lançar."
  },
  {
    q: "Preciso conectar a conta do banco?",
    a: "Não. Você informa o saldo e os lançamentos. A projeção nasce do que foi registrado: recorrências, faturas, parcelas e recebíveis previstos."
  },
  {
    q: "O simulador altera meus lançamentos?",
    a: "Não. A simulação fica separada dos dados reais. Receitas e gastos só entram no sistema quando você escolhe inserir os itens confirmados."
  },
  {
    q: "Dá para controlar cartão e parcelas?",
    a: "Sim. As faturas têm vencimento, itens e status. Um parcelamento distribui a compra pelos meses e pode ficar ligado à fatura correspondente."
  },
  {
    q: "Como funcionam carteiras e recebíveis?",
    a: "As carteiras separam conta, dinheiro, reserva e outros saldos. Os recebíveis registram o que uma pessoa vai pagar, aceitam pagamento parcial e podem ser associados ao gasto que os originou."
  },
  {
    q: "Meus dados ficam protegidos?",
    a: "A senha é armazenada com hash, a sessão usa token e o login tem limite de tentativas por endereço. Em produção, a API exige uma chave secreta própria para emitir esses tokens."
  }
];

const MARQUEE = [
  "Saldo e projeção",
  "Controle mensal",
  "Faturas de cartão",
  "Parcelamentos",
  "Carteiras",
  "Orçamento por categoria",
  "Recebíveis",
  "Simulador de compras",
  "Lançamentos recorrentes",
  "Exportação CSV"
];

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
  return el;
}

function useLandingSeo() {
  useEffect(() => {
    const title = "Kashy365 — controle financeiro pessoal com projeção, faturas e simulador";
    document.title = title;
    document.body.classList.add("lp-open");
    const origin = window.location.origin;
    const canonical = upsertLink("canonical", `${origin}/`);
    const image = `${origin}/landing/print-painel.png`;
    document.querySelector('meta[property="og:image"]')?.setAttribute("content", image);
    document.querySelector('meta[name="twitter:image"]')?.setAttribute("content", image);
    let url = document.head.querySelector('meta[property="og:url"]');
    if (!url) {
      url = document.createElement("meta");
      url.setAttribute("property", "og:url");
      document.head.appendChild(url);
    }
    url.setAttribute("content", `${origin}/`);

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "lp-faq-jsonld";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a }
      }))
    });
    document.head.appendChild(script);

    return () => {
      document.body.classList.remove("lp-open");
      canonical.remove();
      url.remove();
      script.remove();
    };
  }, []);
}

function useReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    document.documentElement.classList.add("lp-ready");
    const nodes = document.querySelectorAll(".lp [data-reveal]");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });
    nodes.forEach((node) => observer.observe(node));
    const revealAll = () => nodes.forEach((node) => node.classList.add("is-in"));
    const fallback = window.setTimeout(revealAll, 1200);
    return () => {
      window.clearTimeout(fallback);
      observer.disconnect();
      document.documentElement.classList.remove("lp-ready");
    };
  }, []);
}

function Shot({ src, alt, caption, label }) {
  return (
    <figure className="lp-shot">
      <div className="lp-shot-bar" aria-hidden="true">
        <span /><span /><span />
        <strong>{label}</strong>
      </div>
      <img src={src} alt={alt} width="1600" height="900" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  useLandingSeo();
  useReveal();

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="lp">
      <header className={`lp-nav${menuOpen ? " is-open" : ""}`}>
        <Link className="lp-brand" to="/" aria-label="Kashy365">
          <img src={BRAND_MARK_SRC} alt="" />
          <span><strong>Kashy</strong><em>365</em></span>
        </Link>
        <nav className="lp-nav-links" aria-label="Seções">
          <a href="#funcoes">Funções</a>
          <a href="#telas">Telas</a>
          <a href="#simulador">Simulador</a>
          <a href="#perguntas">Perguntas</a>
        </nav>
        <div className="lp-nav-auth">
          <Link className="lp-btn lp-btn-ghost" to="/login">Entrar</Link>
          <Link className="lp-btn lp-btn-primary" to="/register">Criar conta</Link>
          <button
            type="button"
            className="lp-menu-btn"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        <nav className="lp-menu" aria-label="Menu móvel" hidden={!menuOpen}>
          <a href="#funcoes" onClick={closeMenu}>Funções</a>
          <a href="#telas" onClick={closeMenu}>Telas</a>
          <a href="#simulador" onClick={closeMenu}>Simulador</a>
          <a href="#perguntas" onClick={closeMenu}>Perguntas</a>
          <Link to="/login" onClick={closeMenu}>Entrar</Link>
        </nav>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div>
              <p className="lp-kicker"><i /> Controle financeiro pessoal</p>
              <h1>Veja o mês <em>fechar</em> antes de ele terminar.</h1>
              <p className="lp-lead">
                Saldo, projeção, faturas, parcelas, carteiras e o que ainda vão te pagar.
                O simulador testa a compra sem tocar nos lançamentos reais.
              </p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn-primary" to="/register">Criar conta <ArrowRight size={16} /></Link>
                <a className="lp-btn lp-btn-ghost" href="#telas">Ver as telas</a>
              </div>
              <p className="lp-hero-note">Sem conexão bancária. O mês é projetado a partir do que você lança.</p>
            </div>
            <div className="lp-stage">
              <div className="lp-stage-glow" aria-hidden="true" />
              <Shot
                src="/landing/print-painel.png"
                alt="Painel do Kashy365 com saldo atual, ganhos, gastos e a projeção de fechamento do mês"
                caption="Painel do mês: saldo, ganhos, gastos e a curva até o fechamento."
                label="Painel"
              />
              <div className="lp-floaters">
                <div className="lp-chip">
                  <b className="up">+ R$ 1.200</b>
                  <span>Freelance previsto</span>
                </div>
                <div className="lp-chip">
                  <b className="down">Fatura em aberto</b>
                  <span>Vence dia 12</span>
                </div>
              </div>
            </div>
          </div>
          <div className="lp-marquee-wrap" aria-hidden="true">
            <div className="lp-marquee">
              {[...MARQUEE, ...MARQUEE].map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}
            </div>
          </div>
        </section>

        <section className="lp-section lp-paper" id="funcoes">
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <p className="lp-kicker"><i /> Funções</p>
              <h2>Tudo o que o mês pede, <em>no mesmo lugar.</em></h2>
              <p className="lp-sub">Não é só anotar o que já passou. O Kashy365 separa o realizado do previsto e deixa cada tipo de dinheiro no seu canto.</p>
            </div>
            <div className="lp-grid">
              {FEATURES.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <article className={`lp-card${feature.wide ? " lp-card-wide" : ""}`} data-reveal style={{ "--d": `${index * 70}ms` }} key={feature.title}>
                    <Icon size={22} aria-hidden="true" />
                    <h3>{feature.title}</h3>
                    <p>{feature.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lp-section lp-dark" id="telas">
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <p className="lp-kicker"><i /> Telas</p>
              <h2>Três leituras que seguram o mês.</h2>
            </div>
            {STORIES.map((story) => (
              <article className={`lp-story${story.flip ? " is-flip" : ""}`} id={story.label === "Simulador" ? "simulador" : undefined} key={story.index} data-reveal>
                <div className="lp-story-copy">
                  <p className="lp-index">{story.index}</p>
                  <h3>{story.title}</h3>
                  <p>{story.text}</p>
                  <ul className="lp-points">
                    {story.points.map((point) => <li key={point}><i />{point}</li>)}
                  </ul>
                </div>
                <Shot src={story.src} alt={story.alt} caption={story.caption} label={story.label} />
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section" id="mais">
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <p className="lp-kicker"><i /> No dia a dia</p>
              <h2>O resto do controle, sem planilha paralela.</h2>
            </div>
            <div className="lp-extra-grid">
              {EXTRAS.map((item, index) => {
                const Icon = item.icon;
                return (
                  <article className="lp-extra" data-reveal style={{ "--d": `${index * 80}ms` }} key={item.title}>
                    <Icon size={20} aria-hidden="true" />
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lp-section lp-paper" id="comecar">
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <p className="lp-kicker"><i /> Como começa</p>
              <h2>Três passos para o mês ficar <em>legível.</em></h2>
            </div>
            <div className="lp-steps">
              {STEPS.map((step, index) => (
                <article className="lp-step" data-reveal style={{ "--d": `${index * 90}ms` }} key={step.n}>
                  <strong>{step.n}</strong>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-paper" id="perguntas" style={{ paddingTop: 0 }}>
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <p className="lp-kicker"><i /> Perguntas</p>
              <h2>Antes de abrir a conta.</h2>
            </div>
            <div className="lp-faq">
              {FAQ.map((item) => (
                <details key={item.q} data-reveal>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" style={{ paddingTop: 0 }}>
          <div className="lp-wrap">
            <div className="lp-cta" data-reveal>
              <h2>Comece pelo saldo <em>de hoje.</em></h2>
              <p>Informe quanto você tem, organize as carteiras se quiser, e deixe o fechamento do mês aparecer.</p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn-primary" to="/register">Criar conta <ArrowRight size={16} /></Link>
                <Link className="lp-btn lp-btn-ghost" to="/login">Já tenho conta</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer lp-wrap">
        <span>Kashy365 · controle financeiro pessoal</span>
        <nav aria-label="Rodapé">
          <a href="#funcoes">Funções</a>
          <a href="#telas">Telas</a>
          <a href="#perguntas">Perguntas</a>
          <Link to="/login">Entrar</Link>
          <Link to="/register">Criar conta</Link>
        </nav>
      </footer>
    </div>
  );
}
