import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, CircleHelp, Grid2X2, List, Plus, X } from "lucide-react";
import { toast } from "react-hot-toast";
import MonthlyTable from "../components/MonthlyTable.jsx";
import MonthCard from "../components/months/MonthCard.jsx";
import ProjectionBreakdownModal from "../modals/ProjectionBreakdownModal.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatMoney } from "../utils/format.js";
import { getMonthPeriod, quickAddDate, todayIsoDate } from "../app/helpers.js";
import { MONTHS_VIEW_MODE_KEY } from "../app/constants.js";
import { getMonthSummary } from "../api/api.js";

const MONTHS_TUTORIAL_VERSION = 1;
const TODAY_JUMP_KEY = "months-jump-to-today";

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
        { target: "summary", eyebrow: "Month closing", title: "Check the totals at the end", description: "The summary adds the month's income and expenses and shows the projected closing balance for the selected period." },
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
      { target: "summary", eyebrow: "Fechamento do mês", title: "Confira os totais no final", description: "O resumo soma os ganhos e gastos do mês e mostra a projeção de fechamento para o período selecionado." },
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

export default function MonthsPage({ monthData, summary, monthCards, invoices = [], expenseOptions = [], year, month, setYear, setMonth, openAddForm, onEditTransaction, removeTransaction, onOpenReceivable, onLoadCategoryDetails, onOverlayChange }) {
  const { user, completeTutorial } = useAuth();
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const tutorialContent = useMemo(() => getTutorialContent(language), [language]);
  const tableRef = useRef(null);
  const [pendingTableScroll, setPendingTableScroll] = useState(false);
  const [todayJump, setTodayJump] = useState(0);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [projectionSummary, setProjectionSummary] = useState(null);
  const [projectionLoadingKey, setProjectionLoadingKey] = useState(null);
  const projectionRequestRef = useRef(0);
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
      items.reduce((total, item) => {
        const period = getMonthPeriod(item);
        const planned = period === "past" ? 0 : Number(item.planned_receivables_total || 0);
        const prior = period === "past" ? 0 : Number(item.prior_planned_receivables_total || 0);
        const inMonth = Math.max(0, planned - prior);
        return total + Number(item.total_income || 0) - Number(item.total_expenses || 0) + inMonth;
      }, 0)
    ]));
  }, [yearGroups]);
  const [expandedYears, setExpandedYears] = useState({});
  const [expandedPreviousMonths, setExpandedPreviousMonths] = useState({});
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
    if ((user.months_tutorial_version || 0) >= MONTHS_TUTORIAL_VERSION) return;
    setTutorialStep(0);
    setTutorialOpen(true);
  }, [user?.id, user?.months_tutorial_version]);

  const closeTutorial = () => {
    setTutorialOpen(false);
    completeTutorial("months", MONTHS_TUTORIAL_VERSION).catch(() => {
      // Uma falha temporária fará o tutorial reaparecer até o progresso ser salvo.
    });
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

  const openCardProjection = async (target) => {
    const key = `${target.year}-${target.month}`;
    const requestId = ++projectionRequestRef.current;
    setProjectionLoadingKey(key);

    if (Number(summary?.year) === Number(target.year) && Number(summary?.month) === Number(target.month)) {
      setProjectionSummary(summary);
      setProjectionLoadingKey(null);
      onOverlayChange?.(true);
      return;
    }

    try {
      const payload = await getMonthSummary(target.year, target.month);
      if (requestId !== projectionRequestRef.current) return;
      setProjectionSummary(payload);
      onOverlayChange?.(true);
    } catch {
      if (requestId === projectionRequestRef.current) {
        toast.error(language === "en-US" ? "Unable to load projection details." : "Não foi possível carregar os detalhes da projeção.");
      }
    } finally {
      if (requestId === projectionRequestRef.current) setProjectionLoadingKey(null);
    }
  };

  const closeCardProjection = () => {
    projectionRequestRef.current += 1;
    setProjectionSummary(null);
    setProjectionLoadingKey(null);
    onOverlayChange?.(false);
  };

  useEffect(() => () => {
    projectionRequestRef.current += 1;
    onOverlayChange?.(false);
  }, [onOverlayChange]);

  useEffect(() => {
    if (viewMode !== "table" || !pendingTableScroll) return undefined;
    const frame = requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingTableScroll(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingTableScroll, viewMode, year, month]);

  const goToToday = () => {
    const today = new Date();
    sessionStorage.setItem(TODAY_JUMP_KEY, "1");
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    changeView("table");
    setTodayJump((value) => value + 1);
  };

  useEffect(() => {
    if (viewMode !== "table" || sessionStorage.getItem(TODAY_JUMP_KEY) !== "1") return undefined;
    const today = new Date();
    const viewingToday = Number(year) === today.getFullYear() && Number(month) === today.getMonth() + 1;
    const dataReady = Number(monthData?.year) === today.getFullYear() && Number(monthData?.month) === today.getMonth() + 1;
    if (!viewingToday || !dataReady) return undefined;
    const row = tableRef.current?.querySelector(`[data-day="${todayIsoDate()}"]`);
    if (!row) return undefined;
    const frame = requestAnimationFrame(() => {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      sessionStorage.removeItem(TODAY_JUMP_KEY);
    });
    return () => cancelAnimationFrame(frame);
  }, [todayJump, viewMode, year, month, monthData]);

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

  const priorPlannedOpening = Number(monthData?.prior_planned_receivables_total || 0);
  const isViewingCurrentMonth = getMonthPeriod({ year, month }) === "current";
  const hasSplitOpening = priorPlannedOpening > 0 && isViewingCurrentMonth;
  const projectedOpening = monthData?.opening_balance_projected ?? (Number(monthData?.opening_balance || 0) + priorPlannedOpening);
  const tableOpeningEyebrow = hasSplitOpening ? (
    <>
      <span>{tt("monthlyTable.realizedOpeningBalance", "Saldo inicial real")} {formatMoney(monthData.opening_balance, language)}</span>
      <span className="opening-balance-projected">{tt("monthlyTable.projectedOpeningBalance", "Saldo inicial previsto")} {formatMoney(projectedOpening, language)}</span>
    </>
  ) : `${tt("monthlyTable.openingBalance", "Saldo inicial")} ${formatMoney(monthData?.opening_balance, language)}`;

  return (
    <section className={viewMode === "table" ? "card" : "months-overview"}>
      <div className={`section-head ${viewMode === "cards" ? "months-overview-head" : ""}`}>
        <div data-months-tour="intro">
          <p className={`eyebrow${viewMode === "table" && hasSplitOpening ? " opening-balance-eyebrow" : ""}`}>
            {viewMode === "table" ? tableOpeningEyebrow : (language === "en-US" ? "FINANCIAL TIMELINE" : "LINHA DO TEMPO FINANCEIRA")}
          </p>
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
          {monthData?.days && (
            <MonthlyTable days={monthData.days} summary={summary} invoices={invoices} expenseOptions={expenseOptions} onAdd={openAddForm} onEdit={onEditTransaction} onDelete={removeTransaction} onOpenReceivable={onOpenReceivable} onLoadCategoryDetails={onLoadCategoryDetails} onOverlayChange={onOverlayChange} />
          )}
        </div>
      ) : (
        <div className="month-year-list">
          {orderedMonthCards.length ? sortedYears.map((groupYear) => {
            const items = yearGroups[groupYear];
            const isExpanded = expandedYears[groupYear];
            const yearResult = yearSummaries[groupYear];
            const resultClass = yearResult > 0 ? "money-income" : yearResult < 0 ? "money-expense" : "money-neutral";
            const includesProjections = items.some((item) => getMonthPeriod(item) === "future" || (getMonthPeriod(item) !== "past" && (Number(item.planned_receivables_total || 0) > 0 || Number(item.open_invoices_projected_total || 0) > 0)));
            const currentItems = items.filter((item) => getMonthPeriod(item) === "current");
            const previousItems = items.filter((item) => getMonthPeriod(item) === "past");
            const futureItems = items.filter((item) => getMonthPeriod(item) === "future");
            const tutorialItem = currentItems[0] || previousItems[0] || futureItems[0];
            const previousMonthsExpanded = expandedPreviousMonths[groupYear] ?? false;

            const renderMonthCard = (item, featured = false) => (
              <MonthCard
                key={`${item.year}-${item.month}`}
                item={item}
                featured={featured}
                onView={() => openMonthTable(item)}
                onQuickAdd={() => openAddForm(quickAddDate(item.year, item.month))}
                onOpenProjection={() => openCardProjection(item)}
                projectionLoading={projectionLoadingKey === `${item.year}-${item.month}`}
                tourTarget={groupYear === tutorialYear && item === tutorialItem ? "month-card" : undefined}
              />
            );

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
                  <div className="month-year-content">
                    {currentItems.length > 0 && (
                      <div className="month-current-feature">
                        {currentItems.map((item) => renderMonthCard(item, true))}
                      </div>
                    )}
                    {previousItems.length > 0 && (
                      <section className={`month-period-section previous ${previousMonthsExpanded ? "expanded" : "collapsed"}`} aria-labelledby={`previous-months-${groupYear}`}>
                        <button
                          className="month-period-toggle"
                          type="button"
                          aria-expanded={previousMonthsExpanded}
                          aria-controls={`previous-month-cards-${groupYear}`}
                          onClick={() => setExpandedPreviousMonths((previous) => ({ ...previous, [groupYear]: !previous[groupYear] }))}
                        >
                          <span className="month-period-toggle-copy">
                            <span className="month-period-toggle-title" id={`previous-months-${groupYear}`}>{language === "en-US" ? "Previous months" : "Meses anteriores"}</span>
                            <span className="month-period-count">{previousItems.length} {language === "en-US" ? (previousItems.length === 1 ? "month" : "months") : (previousItems.length === 1 ? "mês" : "meses")}</span>
                          </span>
                          <ChevronDown size={17} />
                        </button>
                        <div
                          id={`previous-month-cards-${groupYear}`}
                          className="month-period-collapse"
                          aria-hidden={!previousMonthsExpanded}
                        >
                          <div className="month-period-collapse-inner">
                            <div className="month-card-grid">
                              {previousItems.map((item) => renderMonthCard(item))}
                            </div>
                          </div>
                        </div>
                      </section>
                    )}
                    {futureItems.length > 0 && (
                      <section className="month-period-section" aria-labelledby={`future-months-${groupYear}`}>
                        <div className="month-period-heading">
                          <h3 id={`future-months-${groupYear}`}>{language === "en-US" ? "Upcoming months" : "Próximos meses"}</h3>
                        </div>
                        <div className="month-card-grid">
                          {futureItems.map((item) => renderMonthCard(item))}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </section>
            );
          }) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>{language === "en-US" ? "No months with entries yet." : "Nenhum mês com lançamentos."}</h3><p>{language === "en-US" ? "Select + New to get started." : "Clique em + Novo para começar."}</p></div>}
        </div>
      )}
      <button className="month-today-fab" type="button" onClick={goToToday} aria-label={tt("monthlyTable.goToToday", "Ir para o dia de hoje")}>
        <CalendarDays size={18} />
        <span>{tt("monthlyTable.today", "Hoje")}</span>
      </button>
      <button className="month-new-fab" data-months-tour="new" type="button" onClick={() => openAddForm()} aria-label={tt("actions.new", "Novo lançamento")}>
        <Plus size={24} />
      </button>
      {projectionSummary && <ProjectionBreakdownModal summary={projectionSummary} onClose={closeCardProjection} />}
      <MonthsTutorial content={tutorialContent} layoutKey={viewMode} open={tutorialOpen} stepIndex={tutorialStep} onBack={() => setTutorialStep((current) => Math.max(0, current - 1))} onClose={closeTutorial} onNext={advanceTutorial} />
    </section>
  );
}


