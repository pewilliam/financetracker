import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Grid2X2, List, Plus } from "lucide-react";
import MonthlyTable from "../components/MonthlyTable.jsx";
import MonthCard from "../components/months/MonthCard.jsx";
import { useI18n } from "../i18n/index.ts";
import { formatMoney } from "../utils/format.js";
import { getMonthPeriod, quickAddDate } from "../app/helpers.js";
import { MONTHS_VIEW_MODE_KEY } from "../app/constants.js";

export default function MonthsPage({ monthData, summary, monthCards, year, month, setYear, setMonth, openAddForm, setEditing, setDrawerOpen, removeTransaction }) {
  const { t, language } = useI18n();
  const tt = (key, pt, values) => language === "en-US" ? t(key, values) : pt;
  const tableRef = useRef(null);
  const [pendingTableScroll, setPendingTableScroll] = useState(false);
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

  const changeView = (mode) => {
    setViewMode(mode);
    localStorage.setItem(MONTHS_VIEW_MODE_KEY, mode);
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
    const currentYear = String(new Date().getFullYear());
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
        <div>
          <p className="eyebrow">{viewMode === "table" ? `${tt("monthlyTable.openingBalance", "Saldo inicial")} ${formatMoney(monthData.opening_balance, language)}` : (language === "en-US" ? "FINANCIAL TIMELINE" : "LINHA DO TEMPO FINANCEIRA")}</p>
          <h2>{viewMode === "table" ? tt("monthlyTable.monthlyTable", "Tabela mensal") : (language === "en-US" ? "Your months at a glance" : "Seus meses em perspectiva")}</h2>
          {viewMode === "cards" && <p className="months-overview-description">{language === "en-US" ? "Compare cash flow and see how each month changed your balance." : "Compare o fluxo de caixa e veja como cada mês transformou seu saldo."}</p>}
        </div>
        <div className="view-actions">
          <div className="view-toggle" aria-label={language === "en-US" ? "Change view" : "Alternar visualização"}>
            <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => changeView("cards")}><Grid2X2 size={16} /> Cards</button>
            <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => changeView("table")}><List size={16} /> {language === "en-US" ? "Table" : "Tabela"}</button>
          </div>
        </div>
      </div>
      {viewMode === "table" ? (
        <div ref={tableRef}>
          <MonthlyTable days={monthData.days} summary={summary} onAdd={openAddForm} onEdit={(tx) => { setEditing(tx); setDrawerOpen(true); }} onDelete={removeTransaction} />
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
                <button className="month-year-toggle" onClick={() => toggleYear(groupYear)} aria-expanded={isExpanded}>
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
                    {items.map((item) => (
                      <MonthCard
                        key={`${item.year}-${item.month}`}
                        item={item}
                        onView={() => openMonthTable(item)}
                        onQuickAdd={() => openAddForm(quickAddDate(item.year, item.month))}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          }) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>{language === "en-US" ? "No months with entries yet." : "Nenhum mês com lançamentos."}</h3><p>{language === "en-US" ? "Select + New to get started." : "Clique em + Novo para começar."}</p></div>}
        </div>
      )}
      <button className="month-new-fab" type="button" onClick={() => openAddForm()} aria-label={tt("actions.new", "Novo lançamento")}>
        <Plus size={24} />
      </button>
    </section>
  );
}


