import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, CircleHelp, Grid2X2, List, Plus, X } from "lucide-react";
import MonthlyTable from "../components/MonthlyTable.jsx";
import MonthCard from "../components/months/MonthCard.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatMoney } from "../utils/format.js";
import { getMonthPeriod, quickAddDate } from "../app/helpers.js";
import { MONTHS_VIEW_MODE_KEY } from "../app/constants.js";

function getTutorialContent(language) {
  if (language === "en-US") {
    return {
      close: "Close tutorial",
      skip: "Skip tutorial",
      back: "Back",
      next: "Next",
      progress: (current, total) => `Step ${current} of ${total}`,
      steps: [
        { target: "intro", eyebrow: "Welcome", title: "Your financial routine lives here", description: "Monthly control brings together the detailed table for the selected month and a timeline for comparing your financial history." },
        { target: "period", eyebrow: "Selected period", title: "Navigate to any month", description: "Use Previous and Next, choose a month and year directly, or return to the current month with one click. The table and totals follow the selected period." },
        { target: "views", eyebrow: "Two ways to view", title: "Switch between Table and Cards", description: "Table is for managing the selected month in detail. Cards provides a broader view to compare months and years. Your preferred view is remembered." },
        { target: "table", eyebrow: "Monthly table", title: "Follow the month day by day", description: "The table shows each day in sequence, including days without entries, future dates and the running balance after each movement." },
        { target: "entries", eyebrow: "Entries", title: "Understand and manage every movement", description: "See whether an entry is income or an expense, its amount, description, categories, recurrence and linked expense. Use the row actions to edit or delete it and + to add on that date." },
        { target: "summary", eyebrow: "Month closing", title: "Check the totals at the end", description: "The summary adds the month's expenses and income and shows the projected closing balance for the selected period." },
        { target: "new", eyebrow: "New movement", title: "Add entries from anywhere", description: "Use + New at the top or the floating + button to create an entry. In the form, you can also switch to bulk entry when several movements need to be registered." },
        { target: "history", eyebrow: "Financial timeline", title: "Compare months and years", description: "The Cards view groups months by year and shows the result for each period, including projections. Expand or collapse a year to focus on what matters." },
        { target: "month-card", eyebrow: "Month summary", title: "Open a month or add an entry quickly", description: "Each card compares income and expenses, shows opening and closing balances and indicates whether the month is current, past or future. Open it in the table or add an entry directly." },
        { target: "views", eyebrow: "Ready to use", title: "The monthly table is always one click away", description: "Select Table whenever you want to review or change the selected month. You can reopen this tutorial at any time using the help icon.", nextLabel: "Finish" }
      ]
    };
  }

  return {
    close: "Fechar tutorial",
    skip: "Pular tutorial",
    back: "Voltar",
    next: "Próximo",
    progress: (current, total) => `Etapa ${current} de ${total}`,
    steps: [
      { target: "intro", eyebrow: "Boas-vindas", title: "Sua rotina financeira fica aqui", description: "O Controle mensal reúne a tabela detalhada do mês selecionado e uma linha do tempo para comparar seu histórico financeiro." },
      { target: "period", eyebrow: "Período selecionado", title: "Navegue para qualquer mês", description: "Use Anterior e Próximo, escolha diretamente o mês e o ano ou volte ao mês atual com um clique. A tabela e os totais acompanham o período selecionado." },
      { target: "views", eyebrow: "Duas visualizações", title: "Alterne entre Tabela e Cards", description: "A Tabela serve para administrar em detalhes o mês selecionado. Os Cards oferecem uma visão ampla para comparar meses e anos. Sua visualização preferida fica salva." },
      { target: "table", eyebrow: "Tabela mensal", title: "Acompanhe o mês dia após dia", description: "A tabela mostra cada dia em sequência, incluindo dias sem lançamentos, datas futuras e o saldo acumulado depois de cada movimentação." },
      { target: "entries", eyebrow: "Lançamentos", title: "Entenda e administre cada movimentação", description: "Veja se é ganho ou gasto, valor, descrição, categorias, recorrência e gasto associado. Use as ações da linha para editar ou excluir e o + para adicionar naquela data." },
      { target: "summary", eyebrow: "Fechamento do mês", title: "Confira os totais no final", description: "O resumo soma os gastos e ganhos do mês e mostra a projeção de fechamento para o período selecionado." },
      { target: "new", eyebrow: "Nova movimentação", title: "Adicione lançamentos de qualquer ponto", description: "Use + Novo no topo ou o botão flutuante + para criar um lançamento. No formulário, também é possível alternar para o modo em lote quando houver várias movimentações." },
      { target: "history", eyebrow: "Linha do tempo financeira", title: "Compare meses e anos", description: "A visão em Cards agrupa os meses por ano e mostra o resultado de cada período, incluindo previsões. Expanda ou recolha um ano para focar no que importa." },
      { target: "month-card", eyebrow: "Resumo do mês", title: "Abra um mês ou faça um lançamento rápido", description: "Cada card compara ganhos e gastos, mostra saldos inicial e final e indica se o mês é atual, passado ou futuro. Abra-o na tabela ou adicione um lançamento diretamente." },
      { target: "views", eyebrow: "Tudo pronto", title: "A tabela mensal está sempre a um clique", description: "Selecione Tabela sempre que quiser revisar ou alterar o mês escolhido. Você pode abrir este tutorial novamente pelo ícone de ajuda.", nextLabel: "Concluir" }
    ]
  };
}

function MonthsTutorial({ content, layoutKey, open, stepIndex, onBack, onClose, onNext }) {
  const [targetRect, setTargetRect] = useState(null);
  const step = content.steps[stepIndex];

  useLayoutEffect(() => {
    if (!open || !step) return undefined;
    const selector = `[data-months-tour="${step.target}"]`;

    const findVisibleTarget = () => Array.from(document.querySelectorAll(selector)).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });

    const element = findVisibleTarget();
    const settleTimers = [];
    let missingTargetTimer;

    const measure = () => {
      const currentTarget = findVisibleTarget();
      if (!currentTarget) {
        if (!missingTargetTimer) {
          missingTargetTimer = window.setTimeout(() => {
            setTargetRect(null);
            missingTargetTimer = undefined;
          }, 700);
        }
        return;
      }
      if (missingTargetTimer) {
        window.clearTimeout(missingTargetTimer);
        missingTargetTimer = undefined;
      }
      const rect = currentTarget.getBoundingClientRect();
      const nextRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
      setTargetRect((previous) => previous
        && previous.top === nextRect.top
        && previous.left === nextRect.left
        && previous.width === nextRect.width
        && previous.height === nextRect.height
        ? previous
        : nextRect);
    };

    if (element) {
      const rect = element.getBoundingClientRect();
      if (rect.top < 12 || rect.bottom > window.innerHeight - 12) element.scrollIntoView({ behavior: "auto", block: "center" });
    }
    measure();
    [150, 350, 700].forEach((delay) => settleTimers.push(window.setTimeout(measure, delay)));
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      if (missingTargetTimer) window.clearTimeout(missingTargetTimer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [layoutKey, open, step]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open || !step) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const compact = viewportWidth <= 720;
  const spotlightGap = { top: 6, right: 6, bottom: 6, left: 6 };
  const targetInset = step.target === "history"
    ? { top: 0, right: 0, bottom: 13, left: 0 }
    : { top: 0, right: 0, bottom: 0, left: 0 };
  const spotlightTop = targetRect ? Math.max(8, targetRect.top + targetInset.top - spotlightGap.top) : 0;
  const spotlightLeft = targetRect ? Math.max(8, targetRect.left + targetInset.left - spotlightGap.left) : 0;
  const spotlightRight = targetRect ? Math.min(viewportWidth - 8, targetRect.right - targetInset.right + spotlightGap.right) : 0;
  const spotlightBottom = targetRect ? Math.min(viewportHeight - 8, targetRect.bottom - targetInset.bottom + spotlightGap.bottom) : 0;
  const spotlightStyle = targetRect && spotlightRight > spotlightLeft && spotlightBottom > spotlightTop ? {
    top: spotlightTop,
    left: spotlightLeft,
    width: Math.max(0, spotlightRight - spotlightLeft),
    height: Math.max(0, spotlightBottom - spotlightTop)
  } : null;
  let cardStyle = compact ? { left: 16, right: 16, bottom: 16 } : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  if (!compact && targetRect) {
    if (viewportWidth - targetRect.right >= 390) {
      cardStyle = { left: targetRect.right + 18, top: Math.max(16, Math.min(targetRect.top, viewportHeight - 330)) };
    } else if (targetRect.left >= 390) {
      cardStyle = { right: viewportWidth - targetRect.left + 18, top: Math.max(16, Math.min(targetRect.top, viewportHeight - 330)) };
    } else if (viewportHeight - targetRect.bottom >= 300) {
      cardStyle = { left: Math.max(16, Math.min(targetRect.left, viewportWidth - 376)), top: targetRect.bottom + 18 };
    } else if (targetRect.top >= 350) {
      cardStyle = { left: Math.max(16, Math.min(targetRect.left, viewportWidth - 376)), bottom: viewportHeight - targetRect.top + 18 };
    } else {
      cardStyle = { right: 16, bottom: 16 };
    }
  }

  const currentStep = stepIndex + 1;
  const totalSteps = content.steps.length;

  return (
    <div className={`simulation-tutorial-layer months-tutorial-layer ${targetRect ? "has-target" : ""}`} role="dialog" aria-modal="true" aria-labelledby="months-tutorial-title" aria-describedby="months-tutorial-description">
      <button className="simulation-tutorial-backdrop" type="button" onClick={onClose} aria-label={content.close} />
      {spotlightStyle && <div className="simulation-tutorial-spotlight" style={spotlightStyle} />}
      <div className="simulation-tutorial-card" style={cardStyle}>
        <div className="simulation-tutorial-head">
          <span>{step.eyebrow}</span>
          <button className="icon-btn small" type="button" onClick={onClose} aria-label={content.close}><X size={16} /></button>
        </div>
        <h2 id="months-tutorial-title">{step.title}</h2>
        <p id="months-tutorial-description">{step.description}</p>
        <div className="simulation-tutorial-progress" aria-label={content.progress(currentStep, totalSteps)}>
          <span>{content.progress(currentStep, totalSteps)}</span>
          <div>{content.steps.map((_, index) => <i className={index < currentStep ? "active" : ""} key={index} />)}</div>
        </div>
        <div className="simulation-tutorial-actions">
          {stepIndex > 0
            ? <button className="btn btn-ghost" type="button" onClick={onBack}>{content.back}</button>
            : <button className="btn btn-ghost" type="button" onClick={onClose}>{content.skip}</button>}
          <button className="btn btn-primary" type="button" onClick={onNext}>{step.nextLabel || content.next}<ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}

export default function MonthsPage({ monthData, summary, monthCards, expenseOptions = [], year, month, setYear, setMonth, openAddForm, setEditing, setDrawerOpen, removeTransaction, onLoadCategoryDetails, onOverlayChange }) {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const tutorialContent = useMemo(() => getTutorialContent(language), [language]);
  const tutorialStorageKey = `kashy365_months_tutorial_v1_${user?.id || "local"}`;
  const tableRef = useRef(null);
  const [pendingTableScroll, setPendingTableScroll] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem(MONTHS_VIEW_MODE_KEY);
    return saved === "cards" || saved === "table" ? saved : "table";
  });
  const orderedMonthCards = useMemo(() => {
    return [...monthCards].sort((left, right) => {
      const leftIndex = Number(left.year) * 12 + Number(left.month);
      const rightIndex = Number(right.year) * 12 + Number(right.month);
      return leftIndex - rightIndex;
    });
  }, [monthCards]);
  const yearGroups = useMemo(() => {
    return orderedMonthCards.reduce((groups, item) => {
      const key = String(item.year);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
      return groups;
    }, {});
  }, [orderedMonthCards]);
  const sortedYears = useMemo(() => Object.keys(yearGroups).sort((left, right) => Number(left) - Number(right)), [yearGroups]);
  const yearSummaries = useMemo(() => {
    return Object.fromEntries(Object.entries(yearGroups).map(([groupYear, items]) => [
      groupYear,
      items.reduce((total, item) => total + Number(item.total_income || 0) - Number(item.total_expenses || 0), 0)
    ]));
  }, [yearGroups]);
  const [expandedYears, setExpandedYears] = useState({});
  const currentYear = String(new Date().getFullYear());
  const tutorialYear = sortedYears.includes(currentYear) ? currentYear : sortedYears[0];

  const changeView = (mode) => {
    setViewMode(mode);
    localStorage.setItem(MONTHS_VIEW_MODE_KEY, mode);
  };

  useLayoutEffect(() => {
    if (!tutorialOpen) return;
    const target = tutorialContent.steps[tutorialStep]?.target;
    if (target === "history" || target === "month-card") setViewMode("cards");
    if (["table", "entries", "summary", "new"].includes(target) || (target === "views" && tutorialStep === tutorialContent.steps.length - 1)) setViewMode("table");
    if (target === "month-card" && tutorialYear) {
      setExpandedYears((previous) => previous[tutorialYear] ? previous : { ...previous, [tutorialYear]: true });
    }
  }, [tutorialContent, tutorialOpen, tutorialStep, tutorialYear]);

  useEffect(() => {
    if (!user?.id) return;
    try {
      if (localStorage.getItem(tutorialStorageKey) === "1") return;
    } catch {
      // O tutorial ainda pode ser exibido quando o armazenamento não está disponível.
    }
    setTutorialStep(0);
    setTutorialOpen(true);
  }, [tutorialStorageKey, user?.id]);

  const markTutorialSeen = () => {
    try {
      localStorage.setItem(tutorialStorageKey, "1");
    } catch {
      // O fechamento continua funcionando sem armazenamento local.
    }
  };

  const closeTutorial = () => {
    markTutorialSeen();
    setTutorialOpen(false);
  };

  const openTutorial = () => {
    setTutorialStep(0);
    setTutorialOpen(true);
  };

  const advanceTutorial = () => {
    if (tutorialStep >= tutorialContent.steps.length - 1) {
      closeTutorial();
      return;
    }
    setTutorialStep((current) => current + 1);
  };

  const openMonthTable = (target) => {
    setPendingTableScroll(true);
    setYear(target.year);
    setMonth(target.month);
    changeView("table");
  };

  useEffect(() => {
    if (viewMode !== "table" || !pendingTableScroll) return undefined;
    const frame = requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingTableScroll(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingTableScroll, viewMode, year, month]);

  useEffect(() => {
    setExpandedYears((previous) => {
      const next = {};
      sortedYears.forEach((groupYear, index) => {
        next[groupYear] = previous[groupYear] ?? (groupYear === currentYear || (sortedYears.length === 1 && index === 0));
      });
      return next;
    });
  }, [sortedYears]);

  const toggleYear = (groupYear) => {
    setExpandedYears((previous) => ({ ...previous, [groupYear]: !previous[groupYear] }));
  };

  return (
    <section className={viewMode === "table" ? "card" : "months-overview"}>
      <div className={`section-head ${viewMode === "cards" ? "months-overview-head" : ""}`}>
        <div data-months-tour="intro">
          <p className="eyebrow">{viewMode === "table" ? `${tt("monthlyTable.openingBalance", "Saldo inicial")} ${formatMoney(monthData.opening_balance, language)}` : (language === "en-US" ? "FINANCIAL TIMELINE" : "LINHA DO TEMPO FINANCEIRA")}</p>
          <h2>{viewMode === "table" ? tt("monthlyTable.monthlyTable", "Tabela mensal") : (language === "en-US" ? "Your months at a glance" : "Seus meses em perspectiva")}</h2>
          {viewMode === "cards" && <p className="months-overview-description">{language === "en-US" ? "Compare cash flow and see how each month changed your balance." : "Compare o fluxo de caixa e veja como cada mês transformou seu saldo."}</p>}
        </div>
        <div className="view-actions">
          <button className="icon-btn simulation-help-button" type="button" onClick={openTutorial} aria-label={language === "en-US" ? "Open monthly control tutorial" : "Abrir tutorial do controle mensal"} title={language === "en-US" ? "How to use monthly control" : "Como usar o controle mensal"}>
            <CircleHelp size={19} />
          </button>
          <div className="view-toggle" data-months-tour="views" aria-label={language === "en-US" ? "Change view" : "Alternar visualização"}>
            <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => changeView("cards")}><Grid2X2 size={16} /> Cards</button>
            <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => changeView("table")}><List size={16} /> {language === "en-US" ? "Table" : "Tabela"}</button>
          </div>
        </div>
      </div>
      {viewMode === "table" ? (
        <div ref={tableRef} data-months-tour="table">
          <MonthlyTable days={monthData.days} summary={summary} expenseOptions={expenseOptions} onAdd={openAddForm} onEdit={(tx) => { setEditing(tx); setDrawerOpen(true); }} onDelete={removeTransaction} onLoadCategoryDetails={onLoadCategoryDetails} onOverlayChange={onOverlayChange} />
        </div>
      ) : (
        <div className="month-year-list">
          {orderedMonthCards.length ? sortedYears.map((groupYear) => {
            const items = yearGroups[groupYear];
            const isExpanded = expandedYears[groupYear];
            const yearResult = yearSummaries[groupYear];
            const resultClass = yearResult > 0 ? "money-income" : yearResult < 0 ? "money-expense" : "money-neutral";
            const includesProjections = items.some((item) => getMonthPeriod(item) === "future");

            return (
              <section key={groupYear} className={`month-year-group ${isExpanded ? "expanded" : "collapsed"}`}>
                <button className="month-year-toggle" data-months-tour={groupYear === tutorialYear ? "history" : undefined} onClick={() => toggleYear(groupYear)} aria-expanded={isExpanded}>
                  <div className="month-year-title">
                    <span><CalendarDays size={17} /></span>
                    <div className="month-year-heading">
                      <strong>{groupYear}</strong>
                      <span>{items.length} {language === "en-US" ? (items.length === 1 ? "month" : "months") : (items.length === 1 ? "mês" : "meses")}</span>
                    </div>
                  </div>
                  <div className="month-year-summary">
                    <span>{language === "en-US" ? (includesProjections ? "Result incl. projections" : "Period result") : (includesProjections ? "Resultado com previsões" : "Resultado do período")}</span>
                    <strong className={resultClass}>{yearResult > 0 ? "+" : yearResult < 0 ? "−" : ""}{formatMoney(Math.abs(yearResult), language)}</strong>
                  </div>
                  <ChevronDown size={18} />
                </button>
                {isExpanded && (
                  <div className="month-card-grid">
                    {items.map((item, itemIndex) => (
                      <MonthCard
                        key={`${item.year}-${item.month}`}
                        item={item}
                        onView={() => openMonthTable(item)}
                        onQuickAdd={() => openAddForm(quickAddDate(item.year, item.month))}
                        tourTarget={groupYear === tutorialYear && itemIndex === 0 ? "month-card" : undefined}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          }) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>{language === "en-US" ? "No months with entries yet." : "Nenhum mês com lançamentos."}</h3><p>{language === "en-US" ? "Select + New to get started." : "Clique em + Novo para começar."}</p></div>}
        </div>
      )}
      <button className="month-new-fab" data-months-tour="new" type="button" onClick={() => openAddForm()} aria-label={tt("actions.new", "Novo lançamento")}>
        <Plus size={24} />
      </button>
      <MonthsTutorial content={tutorialContent} layoutKey={viewMode} open={tutorialOpen} stepIndex={tutorialStep} onBack={() => setTutorialStep((current) => Math.max(0, current - 1))} onClose={closeTutorial} onNext={advanceTutorial} />
    </section>
  );
}


