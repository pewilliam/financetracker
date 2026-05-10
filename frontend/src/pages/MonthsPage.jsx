import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Grid2X2, List, Plus } from "lucide-react";
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
  const monthCounters = useMemo(() => {
    return orderedMonthCards.reduce((acc, item) => {
      acc[getMonthPeriod(item)] += 1;
      return acc;
    }, { past: 0, current: 0, future: 0 });
  }, [orderedMonthCards]);
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
    <section className={viewMode === "table" ? "card" : undefined}>
      <div className="section-head">
        <div>
          <p className="eyebrow">{tt("monthlyTable.openingBalance", "Saldo inicial")} {formatMoney(monthData.opening_balance)}</p>
          <h2>{viewMode === "table" ? tt("monthlyTable.monthlyTable", "Tabela mensal") : tt("monthlyTable.months", "Meses")}</h2>
          {viewMode === "cards" && (
            <p className="month-card-counters">
              {monthCounters.past} meses passados&nbsp; • &nbsp;Mês atual&nbsp; • &nbsp;{monthCounters.future} meses futuros
            </p>
          )}
        </div>
        <div className="view-actions">
          <div className="view-toggle" aria-label="Alternar visualização">
            <button className={viewMode === "cards" ? "active" : ""} onClick={() => changeView("cards")}><Grid2X2 size={16} /> Cards</button>
            <button className={viewMode === "table" ? "active" : ""} onClick={() => changeView("table")}><List size={16} /> Tabela</button>
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

            return (
              <section key={groupYear} className={`month-year-group ${isExpanded ? "expanded" : "collapsed"}`}>
                <button className="month-year-toggle" onClick={() => toggleYear(groupYear)} aria-expanded={isExpanded}>
                  <div className="month-year-heading">
                    <strong>{groupYear}</strong>
                    <span>{items.length} {items.length === 1 ? "mês" : "meses"}</span>
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
          }) : <div className="empty-state card"><div className="empty-illustration">+</div><h3>Nenhum mês com lançamentos.</h3><p>Clique em + Novo para começar.</p></div>}
        </div>
      )}
      <button className="month-new-fab" type="button" onClick={() => openAddForm()} aria-label={tt("actions.new", "Novo lançamento")}>
        <Plus size={24} />
      </button>
    </section>
  );
}


