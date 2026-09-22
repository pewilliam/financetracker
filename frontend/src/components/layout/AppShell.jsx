import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";
import { CalendarClock, ChevronLeft, ChevronRight, Menu, Plus } from "lucide-react";
import Dashboard from "../Dashboard.jsx";
import { MonthField } from "../DateField.jsx";
import TransactionForm from "../TransactionForm.jsx";
import Sidebar from "./Sidebar.jsx";
import Skeleton from "../common/Skeleton.jsx";
import MonthsPage from "../../pages/MonthsPage.jsx";
import InvoicesPage from "../../pages/InvoicesPage.jsx";
import InstallmentsPage from "../../pages/InstallmentsPage.jsx";
import SimulationPage from "../../pages/SimulationPage.jsx";
import ReceivablesPage, { receivableGroupForId } from "../../pages/ReceivablesPage.jsx";
import CategoriesPage from "../../pages/CategoriesPage.jsx";
import WalletsPage from "../../pages/WalletsPage.jsx";
import SettingsPage from "../../pages/SettingsPage.jsx";
import InvoiceModal from "../../modals/InvoiceModal.jsx";
import InstallmentModal from "../../modals/InstallmentModal.jsx";
import InstallmentDetailsModal from "../../modals/InstallmentDetailsModal.jsx";
import ReceivableModal from "../../modals/ReceivableModal.jsx";
import ReceivableDetailsModal from "../../modals/ReceivableDetailsModal.jsx";
import ReceivablePaymentModal from "../../modals/ReceivablePaymentModal.jsx";
import CancelReceivablePaymentModal from "../../modals/CancelReceivablePaymentModal.jsx";
import DeleteReceivableModal from "../../modals/DeleteReceivableModal.jsx";
import DeleteTransactionModal from "../../modals/DeleteTransactionModal.jsx";
import DeleteInstallmentModal from "../../modals/DeleteInstallmentModal.jsx";
import BatchTransactionModal from "../../modals/BatchTransactionModal.jsx";
import { useI18n } from "../../i18n/index.ts";
import { useAuth } from "../../hooks/useAuth.jsx";
import { BRAND_MARK_SRC, CREATE_RECEIVABLE_PERSON_VALUE, MOBILE_MEDIA_QUERY } from "../../app/constants.js";
import { defaultInstallmentForm, defaultInvoiceForm, defaultReceivableForm, isInvoiceTransaction, isMobileViewport, nextDueDateFromDay, normalizeTransactionPayload, shiftMonth, todayIsoDate } from "../../app/helpers.js";
import { addInvoiceItem, createCategory, createInstallment, createInvoice, createInvoiceTemplate, createReceivable, createReceivablePayment, createReceivablePerson, createRecurrence, createTransaction, createTransactionBatch, deleteCategory, deleteInstallment, deleteInstallmentItem, deleteInvoice, deleteInvoiceItem, deleteInvoiceTemplate, deleteReceivable, deleteReceivablePayment, deleteTransaction, getCategoryBreakdown, getInstallment, getMonth, getMonthlyBudgetPlan, getMonthSummarySeries, getMonthsSummary, listCategories, listInvoices, listInvoiceTemplates, listLinkedReceivableTransactions, listReceivableExpenseOptions, listReceivablePeople, listReceivables, listWallets, markReceivablePaid, setInvoicePaid, toggleInvoiceTemplate, updateBudgetReserveRule, updateCategory, updateInstallmentCategory, updateInstallmentItem, updateInvoice, updateInvoiceItem, updateInvoiceTemplate, updateMonthlyBudgetPlan, updateReceivable, updateRecurrence, updateTransaction } from "../../api/api.js";
import { formatMoney, formatMonthLabel, parseTypedMoneyInput } from "../../utils/format.js";

export default function AppShell() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [monthData, setMonthData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [comparisons, setComparisons] = useState([]);
  const [monthCards, setMonthCards] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoiceTemplates, setInvoiceTemplates] = useState([]);
  const [installmentsRevision, setInstallmentsRevision] = useState(0);
  const [categories, setCategories] = useState([]);
  const [walletSummary, setWalletSummary] = useState({ total_balance: 0, active_count: 0, wallets: [] });
  const [categoryBreakdown, setCategoryBreakdown] = useState({ total_expenses: 0, categorized_total: 0, items: [], chart_items: [], total_income: 0, income_categorized_total: 0, income_items: [], income_chart_items: [] });
  const [previousCategoryBreakdown, setPreviousCategoryBreakdown] = useState({ total_expenses: 0, categorized_total: 0, items: [], chart_items: [], total_income: 0, income_categorized_total: 0, income_items: [], income_chart_items: [] });
  const [budgetPlan, setBudgetPlan] = useState(null);
  const [receivables, setReceivables] = useState([]);
  const [linkedReceivableTransactions, setLinkedReceivableTransactions] = useState([]);
  const [receivablePeople, setReceivablePeople] = useState([]);
  const [receivableExpenseOptions, setReceivableExpenseOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [dashboardLoadError, setDashboardLoadError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(() => {
    if (isMobileViewport()) return false;
    try {
      const v = localStorage.getItem("menuOpen");
      if (v === null) return true;
      return v === "1";
    } catch (e) {
      return true;
    }
  });

  useEffect(() => {
    if (isMobileViewport()) return;
    try {
      localStorage.setItem("menuOpen", menuOpen ? "1" : "0");
    } catch (e) {
      // ignore
    }
  }, [menuOpen]);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_MEDIA_QUERY);
    const closeMobileDrawer = () => {
      if (media.matches) setMenuOpen(false);
    };
    closeMobileDrawer();
    media.addEventListener("change", closeMobileDrawer);
    return () => media.removeEventListener("change", closeMobileDrawer);
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(defaultInvoiceForm);
  const [installmentModal, setInstallmentModal] = useState(false);
  const [installmentForm, setInstallmentForm] = useState(defaultInstallmentForm);
  const [installmentDetails, setInstallmentDetails] = useState(null);
  const [installmentToDelete, setInstallmentToDelete] = useState(null);
  const [deletingInstallment, setDeletingInstallment] = useState(false);
  const [receivableModal, setReceivableModal] = useState(false);
  const [receivableForm, setReceivableForm] = useState(defaultReceivableForm);
  const [editingReceivable, setEditingReceivable] = useState(null);
  const [receivablePayment, setReceivablePayment] = useState(null);
  const [paymentToCancel, setPaymentToCancel] = useState(null);
  const [receivableToDelete, setReceivableToDelete] = useState(null);
  const [receivableDetailsId, setReceivableDetailsId] = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [pageOverlayOpen, setPageOverlayOpen] = useState(false);
  const [budgetMobileTab, setBudgetMobileTab] = useState("categories");
  const [dashboardSection, setDashboardSection] = useState("overview");
  const viewGeneration = useRef(0);
  const invoiceDetailRequests = useRef(new Set());
  const extrasInFlight = useRef(new Set());
  const seriesGeneration = useRef(0);
  const freshRef = useRef({ period: "", flags: {} });
  const invoicesRef = useRef(invoices);
  const loadViewRef = useRef(null);
  invoicesRef.current = invoices;
  const selectedPeriodRef = useRef({ year, month, language });
  selectedPeriodRef.current = { year, month, language };

  const monthInputValue = `${year}-${String(month).padStart(2, "0")}`;
  const viewingCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;
  const allowOverdueInvoiceEdits = Boolean(user?.allow_overdue_invoice_edits);
  const showMonthHeader = location.pathname === "/" || location.pathname === "/meses" || location.pathname === "/categorias";
  const viewingBudget = location.pathname === "/categorias";
  const loadingVariant = location.pathname === "/meses" ? "months" : location.pathname === "/categorias" ? "categories" : "dashboard";
  const loadingLabel = language === "en-US"
    ? `Loading ${formatMonthLabel(year, month, language)}`
    : `Carregando dados de ${formatMonthLabel(year, month, language)}`;
  const loadingHint = language === "en-US" ? "Please wait while the values are updated." : "Aguarde enquanto atualizamos os valores.";
  const receivableDetailsGroup = useMemo(
    () => receivableGroupForId(receivables, receivableDetailsId),
    [receivableDetailsId, receivables]
  );
  const overlayOpen = drawerOpen || batchModalOpen || invoiceModal || installmentModal || !!installmentDetails || !!installmentToDelete || receivableModal || !!receivableDetailsGroup || !!receivablePayment || !!paymentToCancel || !!receivableToDelete || !!transactionToDelete || pageOverlayOpen;
  const bodyLocked = overlayOpen;

  useEffect(() => {
    if (bodyLocked) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.overflow = "";
    } else {
      const scrollY = Math.abs(parseInt(document.body.style.top || "0", 10));
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      if (scrollY) window.scrollTo(0, scrollY);
    }
    return () => {
      const scrollY = Math.abs(parseInt(document.body.style.top || "0", 10));
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      if (scrollY) window.scrollTo(0, scrollY);
    };
  }, [bodyLocked]);

  useEffect(() => {
    if (receivableDetailsId && !receivableDetailsGroup) setReceivableDetailsId(null);
  }, [receivableDetailsId, receivableDetailsGroup]);

  useEffect(() => {
    if (location.pathname !== "/meses") setReceivableDetailsId(null);
  }, [location.pathname]);

  const periodResources = new Set(["month", "monthSlim", "summary", "summaryPrevious", "summarySeries", "categoryBreakdown", "previousBreakdown", "budgetPlan"]);

  function rememberPeriod() {
    const period = `${year}-${month}`;
    if (freshRef.current.period === period) return;
    const flags = {};
    for (const [key, value] of Object.entries(freshRef.current.flags)) {
      if (!periodResources.has(key)) flags[key] = value;
    }
    freshRef.current = { period, flags };
  }

  function isFresh(name) {
    rememberPeriod();
    const flags = freshRef.current.flags;
    if (name === "monthSlim" && (flags.month || flags.monthSlim)) return true;
    if (name === "summary" && (flags.summary || flags.summarySeries)) return true;
    if (name === "summaryPrevious" && (flags.summaryPrevious || flags.summarySeries)) return true;
    return Boolean(flags[name]);
  }

  function markFresh(name) {
    rememberPeriod();
    freshRef.current.flags[name] = true;
    if (name === "month") freshRef.current.flags.monthSlim = true;
    if (name === "summarySeries") {
      freshRef.current.flags.summary = true;
      freshRef.current.flags.summaryPrevious = true;
    }
  }

  function invalidateResources(names) {
    rememberPeriod();
    names.forEach((name) => {
      delete freshRef.current.flags[name];
    });
  }

  function resourcesForView() {
    const settingsSection = new URLSearchParams(location.search).get("secao") || "conta";
    if (location.pathname === "/") {
      const names = ["monthSlim", "summary", "summaryPrevious", "invoiceHeaders"];
      if (dashboardSection === "history") names.push("summarySeries");
      if (dashboardSection === "categories") names.push("categories", "categoryBreakdown");
      return names;
    }
    if (location.pathname === "/meses") return ["month", "summary", "monthCards", "invoiceHeaders", "expenseOptions"];
    if (location.pathname === "/categorias") return ["categories", "categoryBreakdown", "previousBreakdown", "budgetPlan"];
    if (location.pathname === "/carteiras") return ["wallets"];
    if (location.pathname === "/faturas" || location.pathname === "/parcelamentos") return ["invoiceHeaders", "categories"];
    if (location.pathname === "/simulador") return ["invoiceHeaders", "monthCards"];
    if (location.pathname === "/recebiveis") return ["receivables", "linked", "categories"];
    if (location.pathname === "/configuracoes") {
      if (settingsSection === "modelos") return ["templates"];
      if (settingsSection === "financeiro") return ["summary", "categories"];
      if (settingsSection === "dados") return ["monthSlim"];
      return [];
    }
    return ["monthSlim", "summary", "summaryPrevious", "invoiceHeaders"];
  }

  function blocksFirstPaint(name) {
    if (name === "summarySeries") return false;
    if (location.pathname === "/" && (name === "categories" || name === "categoryBreakdown")) return false;
    return true;
  }

  function mergeInvoiceHeaders(current, headers) {
    const details = new Map(current.filter((item) => item.items_included !== false).map((item) => [item.id, item]));
    return headers
      .map((row) => {
        const detailed = details.get(row.id);
        if (!detailed) return row;
        return { ...detailed, ...row, items: detailed.items, installment_items: detailed.installment_items, items_included: true };
      })
      .sort((left, right) => String(left.due_date).localeCompare(String(right.due_date)) || left.id - right.id);
  }

  async function loadMissing(missing, signal) {
    const tasks = [];
    const alive = () => !signal.aborted && selectedPeriodRef.current.year === year && selectedPeriodRef.current.month === month;

    if (missing.includes("summarySeries") || missing.includes("summary") || missing.includes("summaryPrevious")) {
      const count = missing.includes("summarySeries") ? 6 : 2;
      const generation = ++seriesGeneration.current;
      tasks.push((async () => {
        const rows = await getMonthSummarySeries(year, month, count, { signal });
        if (!alive() || generation !== seriesGeneration.current) return;
        const currentRow = rows.find((item) => item.year === year && item.month === month) || rows.at(-1);
        setSummary(currentRow);
        setComparisons(rows);
        markFresh(count >= 6 ? "summarySeries" : "summaryPrevious");
        markFresh("summary");
      })());
    }
    if (missing.includes("month") || missing.includes("monthSlim")) {
      const includeLinks = missing.includes("month");
      tasks.push((async () => {
        const payload = await getMonth(year, month, { includeLinks, signal });
        if (!alive()) return;
        setMonthData(payload);
        markFresh(includeLinks ? "month" : "monthSlim");
      })());
    }
    if (missing.includes("invoiceHeaders")) {
      tasks.push((async () => {
        const payload = await listInvoices({ includeItems: false, signal });
        if (!alive()) return;
        setInvoices((current) => mergeInvoiceHeaders(current, payload));
        markFresh("invoiceHeaders");
      })());
    }
    if (missing.includes("categories")) {
      tasks.push((async () => {
        const payload = await listCategories({ signal });
        if (!alive()) return;
        setCategories(payload);
        markFresh("categories");
      })());
    }
    if (missing.includes("wallets")) {
      tasks.push((async () => {
        const payload = await listWallets(true, { signal });
        if (!alive()) return;
        setWalletSummary(payload);
        markFresh("wallets");
      })());
    }
    if (missing.includes("templates")) {
      tasks.push((async () => {
        const payload = await listInvoiceTemplates(undefined, { signal });
        if (!alive()) return;
        setInvoiceTemplates(payload);
        markFresh("templates");
      })());
    }
    if (missing.includes("categoryBreakdown")) {
      tasks.push((async () => {
        const payload = await getCategoryBreakdown(year, month, { signal });
        if (!alive()) return;
        setCategoryBreakdown(payload);
        markFresh("categoryBreakdown");
      })());
    }
    if (missing.includes("previousBreakdown")) {
      const previousTarget = shiftMonth(year, month, -1);
      tasks.push((async () => {
        const payload = await getCategoryBreakdown(previousTarget.year, previousTarget.month, { signal });
        if (!alive()) return;
        setPreviousCategoryBreakdown(payload);
        markFresh("previousBreakdown");
      })());
    }
    if (missing.includes("budgetPlan")) {
      tasks.push((async () => {
        const payload = await getMonthlyBudgetPlan(year, month, { signal });
        if (!alive()) return;
        setBudgetPlan(payload);
        markFresh("budgetPlan");
      })());
    }
    if (missing.includes("receivables")) {
      tasks.push((async () => {
        const payload = await listReceivables({ signal });
        if (!alive()) return;
        setReceivables(payload);
        markFresh("receivables");
      })());
    }
    if (missing.includes("linked")) {
      tasks.push((async () => {
        const payload = await listLinkedReceivableTransactions({ signal });
        if (!alive()) return;
        setLinkedReceivableTransactions(payload);
        markFresh("linked");
      })());
    }
    if (missing.includes("people")) {
      tasks.push((async () => {
        const payload = await listReceivablePeople({ signal });
        if (!alive()) return;
        setReceivablePeople(payload);
        markFresh("people");
      })());
    }
    if (missing.includes("expenseOptions")) {
      tasks.push((async () => {
        const payload = await listReceivableExpenseOptions({ signal });
        if (!alive()) return;
        setReceivableExpenseOptions(payload);
        markFresh("expenseOptions");
      })());
    }
    if (missing.includes("monthCards")) {
      tasks.push((async () => {
        const payload = await getMonthsSummary({ signal });
        if (!alive()) return;
        setMonthCards(payload);
        markFresh("monthCards");
      })());
    }
    await Promise.all(tasks);
  }

  async function loadView({ signal, showSkeleton }) {
    const generation = ++viewGeneration.current;
    const required = resourcesForView();
    const missing = required.filter((name) => !isFresh(name));
    if (!missing.length) {
      if (generation === viewGeneration.current) setLoading(false);
      return;
    }
    if (showSkeleton && missing.some(blocksFirstPaint)) setLoading(true);
    if (location.pathname === "/" && missing.some(blocksFirstPaint)) setDashboardLoadError(false);
    if (missing.includes("summarySeries")) setHistoryLoading(true);
    if (missing.includes("categoryBreakdown")) setCategoriesLoading(true);
    try {
      await loadMissing(missing, signal);
    } catch (error) {
      if (signal.aborted || error?.name === "AbortError") return;
      if (generation !== viewGeneration.current) return;
      if (location.pathname === "/") setDashboardLoadError(true);
      toast.error(t("toasts.loadDataError"));
    } finally {
      if (generation === viewGeneration.current && !signal.aborted) {
        setLoading(false);
        setHistoryLoading(false);
        setCategoriesLoading(false);
      }
    }
  }

  loadViewRef.current = loadView;

  async function refresh() {
    freshRef.current = { period: "", flags: {} };
    setLoading(true);
    if (location.pathname === "/") setDashboardLoadError(false);
    const controller = new AbortController();
    await loadView({ signal: controller.signal, showSkeleton: true });
  }

  async function ensureExtras(names) {
    const missing = names.filter((name) => !isFresh(name) && !extrasInFlight.current.has(name));
    if (!missing.length) return;
    missing.forEach((name) => extrasInFlight.current.add(name));
    const controller = new AbortController();
    try {
      await loadMissing(missing, controller.signal);
    } finally {
      missing.forEach((name) => extrasInFlight.current.delete(name));
    }
  }

  useLayoutEffect(() => {
    if (resourcesForView().some((name) => blocksFirstPaint(name) && !isFresh(name))) setLoading(true);
  }, [year, month, location.pathname, location.search]);

  useEffect(() => {
    const controller = new AbortController();
    loadViewRef.current?.({ signal: controller.signal, showSkeleton: true });
    return () => controller.abort();
  }, [year, month, location.pathname, location.search, dashboardSection]);

  const sortInvoicesByDueDate = (items) => [...items].sort((left, right) => String(left.due_date).localeCompare(String(right.due_date)) || left.id - right.id);

  const upsertInvoice = (updatedInvoice) => {
    setInvoices((current) => {
      const exists = current.some((invoice) => invoice.id === updatedInvoice.id);
      const next = exists
        ? current.map((invoice) => invoice.id === updatedInvoice.id ? updatedInvoice : invoice)
        : [...current, updatedInvoice];
      return sortInvoicesByDueDate(next);
    });
  };

  const syncInvoiceCollections = async () => {
    invalidateResources(["invoiceHeaders"]);
    const invoicesPayload = await listInvoices({ includeItems: false });
    setInvoices((current) => mergeInvoiceHeaders(current, invoicesPayload));
    markFresh("invoiceHeaders");
  };

  const syncReceivableCollections = async () => {
    const [receivablesPayload, linkedReceivablesPayload, peoplePayload, expenseOptionsPayload] = await Promise.all([
      listReceivables(),
      listLinkedReceivableTransactions(),
      listReceivablePeople(),
      listReceivableExpenseOptions()
    ]);
    setReceivables(receivablesPayload);
    setLinkedReceivableTransactions(linkedReceivablesPayload);
    setReceivablePeople(peoplePayload);
    setReceivableExpenseOptions(expenseOptionsPayload);
    markFresh("receivables");
    markFresh("linked");
    markFresh("people");
    markFresh("expenseOptions");
  };

  const syncMonthCollections = async () => {
    invalidateResources([
      "month", "monthSlim", "summary", "summaryPrevious", "summarySeries",
      "categoryBreakdown", "previousBreakdown", "budgetPlan", "monthCards", "wallets", "linked", "expenseOptions"
    ]);
    const controller = new AbortController();
    await loadView({ signal: controller.signal, showSkeleton: false });
  };

  const syncInvoiceAndMonthCollections = async () => {
    await Promise.all([
      syncInvoiceCollections(),
      syncMonthCollections()
    ]);
  };

  const balanceSeries = useMemo(() => monthData?.days?.map((day) => ({ date: day.date, balance: day.balance, hasFuture: day.has_future })) || [], [monthData]);
  const comparisonView = useMemo(() => comparisons.map((item) => ({
    ...item,
    label: formatMonthLabel(item.year, item.month, language).slice(0, 3)
  })), [comparisons, language]);

  const loadCategoryExpenseDetails = (targetYear = year, targetMonth = month) => getCategoryBreakdown(targetYear, targetMonth, { includeDetails: true });

  const openAddForm = (dateString = todayIsoDate()) => {
    setSelectedDate(dateString);
    setEditing(null);
    setDrawerOpen(true);
    void ensureExtras(["categories", "wallets", "expenseOptions"]);
  };

  const loadInvoiceDetails = useCallback(async (ids) => {
    const missing = [...new Set(ids)].filter((id) => {
      const invoice = invoicesRef.current.find((item) => item.id === id);
      return invoice && invoice.items_included === false && !invoiceDetailRequests.current.has(id);
    });
    if (!missing.length) return;
    missing.forEach((id) => invoiceDetailRequests.current.add(id));
    try {
      const details = await listInvoices({ includeItems: true, ids: missing });
      setInvoices((current) => {
        const byId = new Map(details.map((invoice) => [invoice.id, { ...invoice, items_included: true }]));
        return current.map((invoice) => byId.get(invoice.id) || invoice);
      });
    } finally {
      missing.forEach((id) => invoiceDetailRequests.current.delete(id));
    }
  }, []);

  const openInvoiceItems = (invoiceId) => {
    if (!invoiceId) return;
    setDrawerOpen(false);
    setEditing(null);
    navigate("/faturas", { state: { openInvoiceItemsId: invoiceId } });
  };

  const openReceivableDetails = (receivable) => {
    if (!receivable?.id) return;
    const group = receivableGroupForId(receivables, receivable.id);
    if (!group) {
      toast.error(language === "en-US" ? "Receivable not found." : "Recebível não encontrado.");
      return;
    }
    setReceivableDetailsId(receivable.id);
  };

  const openTransactionEditor = async (transaction) => {
    if (isInvoiceTransaction(transaction)) {
      openInvoiceItems(transaction.invoice_id);
      return;
    }
    void ensureExtras(["categories", "wallets", "expenseOptions"]);
    let current = transaction;
    if (!isFresh("month")) {
      try {
        const payload = await getMonth(year, month, { includeLinks: true });
        setMonthData(payload);
        markFresh("month");
        const linked = payload.days?.flatMap((day) => day.transactions || []).find((item) => item.id === transaction.id);
        if (linked) current = linked;
      } catch {
        current = transaction;
      }
    }
    setSelectedDate(current.date);
    setEditing(current);
    setDrawerOpen(true);
  };

  const saveTransaction = async (payload) => {
    try {
      if (isInvoiceTransaction(editing)) {
        toast.error(language === "en-US"
          ? "Invoice totals and names are updated through invoice items and models."
          : "Valor e nome da fatura são atualizados pelos itens e pelo modelo.");
        return;
      }
      const normalizedData = normalizeTransactionPayload(payload.data);
      if (editing) {
        if (!normalizedData.date) delete normalizedData.date;
        if (payload.recurrenceUpdate?.enabled) {
          await updateRecurrence(payload.recurrenceUpdate.id, {
            description: normalizedData.description || "Recorrência",
            type: normalizedData.type,
            amount: normalizedData.amount,
            day_of_month: payload.recurrenceUpdate.day_of_month,
            active: true,
            apply_to: payload.recurrenceUpdate.apply_to,
            effective_date: payload.recurrenceUpdate.effective_date,
            category_ids: normalizedData.category_ids,
            wallet_id: normalizedData.wallet_id
          });
        } else {
          await updateTransaction(editing.id, normalizedData);
        }
      } else {
        if (!normalizedData.date) {
          toast.error("Data inválida para criar lançamento");
          return;
        }
        if (payload.recurrence?.enabled) {
          await createRecurrence({
            description: normalizedData.description || "Recorrência",
            type: normalizedData.type,
            amount: normalizedData.amount,
            day_of_month: payload.recurrence.day_of_month,
            recurrence_months: payload.recurrence.recurrence_months,
            start_date: normalizedData.date,
            active: true,
            category_ids: normalizedData.category_ids,
            wallet_id: normalizedData.wallet_id
          });
        } else {
          await createTransaction(normalizedData);
        }
      }
      toast.success(payload.recurrenceUpdate?.enabled ? "Recorrência atualizada" : editing ? "Lançamento salvo" : "Lançamento adicionado!");
      setDrawerOpen(false);
      await syncMonthCollections();
    } catch (error) {
      const details = String(error?.message || "");
      toast.error(
        details.includes("exceeds expense amount")
          ? "O valor excede a parte disponível do gasto selecionado."
          : details.includes("422")
            ? "Dados inválidos ao salvar. Revise data e valor."
            : "Erro ao salvar lançamento"
      );
    }
  };

  const removeTransaction = async (id) => {
    try {
      await deleteTransaction(id);
      toast.success("Item removido");
      setTransactionToDelete(null);
      await syncMonthCollections();
    } catch {
      toast.error("Erro ao remover item");
    }
  };

  const createNewInvoice = async (drafts) => {
    try {
      const createdInvoices = await Promise.all(drafts.map((draft) => createInvoice({
        template_id: Number(draft.template_id),
        due_date: draft.due_date,
        wallet_id: Number(draft.wallet_id)
      })));
      const createdIds = new Set(createdInvoices.map((invoice) => invoice.id));
      setInvoices((current) => sortInvoicesByDueDate([
        ...current.filter((invoice) => !createdIds.has(invoice.id)),
        ...createdInvoices
      ]));
      setInvoiceForm(defaultInvoiceForm());
      setInvoiceModal(false);
      toast.success(`${drafts.length} ${drafts.length === 1 ? "fatura criada" : "faturas criadas"} com sucesso!`);
      await syncMonthCollections();
    } catch {
      toast.error("Erro ao criar fatura");
    }
  };

  const openNewInvoiceModal = async () => {
    try {
      let templates = invoiceTemplates;
      let wallets = walletSummary.wallets;
      const needsTemplates = !isFresh("templates");
      const needsWallets = !isFresh("wallets");
      if (needsTemplates || needsWallets) {
        const [templatePayload, walletPayload] = await Promise.all([
          needsTemplates ? listInvoiceTemplates() : null,
          needsWallets ? listWallets() : null
        ]);
        if (templatePayload) {
          templates = templatePayload;
          setInvoiceTemplates(templatePayload);
          markFresh("templates");
        }
        if (walletPayload) {
          wallets = walletPayload.wallets || [];
          setWalletSummary(walletPayload);
          markFresh("wallets");
        }
      }
      const activeTemplate = templates.find((template) => template.active);
      const activeWallet = wallets.find((wallet) => wallet.active && wallet.is_primary) || wallets.find((wallet) => wallet.active);
      const initialForm = { ...defaultInvoiceForm(), wallet_id: String(activeWallet?.id || "") };
      setInvoiceForm(activeTemplate ? { ...initialForm, template_id: String(activeTemplate.id), due_date: nextDueDateFromDay(activeTemplate.default_due_day) } : initialForm);
      setInvoiceModal(true);
    } catch {
      toast.error("Erro ao preparar a nova fatura");
    }
  };

  const saveInvoiceTemplate = async (payload, id = null) => {
    const saved = id ? await updateInvoiceTemplate(id, payload) : await createInvoiceTemplate(payload);
    const templatesPayload = await listInvoiceTemplates();
    setInvoiceTemplates(templatesPayload);
    markFresh("templates");
    return saved;
  };

  const toggleTemplate = async (template) => {
    try {
      await toggleInvoiceTemplate(template.id);
      toast.success(template.active ? "Modelo desativado" : "Modelo reativado");
      await refresh();
    } catch {
      toast.error("Erro ao atualizar modelo");
    }
  };

  const removeTemplate = async (template) => {
    try {
      await deleteInvoiceTemplate(template.id);
      toast.success("Modelo excluído");
      await refresh();
    } catch (error) {
      toast.error(error.message?.includes("Existem") ? "Existem faturas pendentes vinculadas a este modelo" : "Erro ao excluir modelo");
    }
  };

  const openInstallmentModal = (invoice = null) => {
    setInstallmentForm(defaultInstallmentForm(invoice?.id || ""));
    setInstallmentModal(true);
  };

  const createNewInstallment = async (payload) => {
    try {
      await createInstallment(payload);
      setInstallmentsRevision((current) => current + 1);
      setInstallmentForm(defaultInstallmentForm());
      setInstallmentModal(false);
      toast.success("Compra parcelada criada");
      await syncInvoiceAndMonthCollections();
      return true;
    } catch (error) {
      toast.error(String(error?.message || "").includes("Invoice no longer accepts") ? "A fatura escolhida não aceita novos itens" : "Erro ao criar compra parcelada");
      return false;
    }
  };

  const removeInstallment = async (id) => {
    setDeletingInstallment(true);
    try {
      await deleteInstallment(id);
      setInstallmentDetails(null);
      setInstallmentToDelete(null);
      setInstallmentsRevision((current) => current + 1);
      toast.success("Compra parcelada removida");
      await syncInvoiceAndMonthCollections();
      return true;
    } catch {
      toast.error("Erro ao remover compra parcelada");
      return false;
    } finally {
      setDeletingInstallment(false);
    }
  };

  const requestInstallmentDelete = (purchase) => {
    setInstallmentDetails(null);
    setInstallmentToDelete(purchase);
  };

  const removeInstallmentItem = async (id) => {
    try {
      await deleteInstallmentItem(id);
      toast.success("Parcela removida");
      await syncInvoiceAndMonthCollections();
    } catch {
      toast.error("Erro ao remover parcela");
    }
  };

  const saveInstallmentItem = async (id, payload) => {
    try {
      const updated = await updateInstallmentItem(id, payload);
      setInstallmentDetails(updated);
      setInstallmentsRevision((current) => current + 1);
      toast.success("Parcela atualizada");
      await syncInvoiceAndMonthCollections();
    } catch (error) {
      toast.error(String(error?.message || "").includes("Invoice no longer accepts") ? "A fatura escolhida não aceita novos itens" : "Erro ao atualizar parcela");
      throw error;
    }
  };

  const saveTransactionBatch = async (payload) => {
    try {
      const result = await createTransactionBatch(payload);
      setBatchModalOpen(false);
      toast.success(`${result.created_count} ${result.created_count === 1 ? "lançamento adicionado" : "lançamentos adicionados"}!`);
      await syncMonthCollections();
      return result;
    } catch (error) {
      const details = String(error?.message || "");
      toast.error(details.includes("1000")
        ? "O lote pode ter no máximo 1.000 lançamentos."
        : details.includes("Category not found")
          ? "A categoria selecionada não está mais disponível."
          : "Erro ao adicionar lançamentos em lote.");
      throw error;
    }
  };

  const saveInstallmentCategory = async (id, categoryIds) => {
    try {
      const updated = await updateInstallmentCategory(id, categoryIds);
      setInstallmentDetails(updated);
      setInstallmentsRevision((current) => current + 1);
      toast.success(categoryIds?.length ? "Categorias da compra atualizadas" : "Categorias removidas da compra");
      await syncInvoiceAndMonthCollections();
      return updated;
    } catch (error) {
      toast.error("Erro ao atualizar categoria da compra");
      throw error;
    }
  };

  const showInstallmentDetails = async (id, startEditing = false) => {
    try {
      const purchase = await getInstallment(id);
      setInstallmentDetails(startEditing ? { ...purchase, __startEditing: true } : purchase);
    } catch {
      toast.error("Erro ao carregar parcelamento");
    }
  };

  const addItem = async (invoiceId, payload) => {
    try {
      const updated = await addInvoiceItem(invoiceId, payload);
      upsertInvoice(updated);
      toast.success(Number(payload.amount) < 0 ? "Reembolso adicionado" : "Item adicionado");
      await syncMonthCollections();
    } catch (error) {
      toast.error(String(error?.message || "").includes("Invoice no longer accepts") ? "Esta fatura não aceita novos itens" : Number(payload.amount) < 0 ? "Erro ao adicionar reembolso" : "Erro ao adicionar item");
      throw error;
    }
  };

  const saveItem = async (invoiceId, itemId, payload) => {
    try {
      const updated = await updateInvoiceItem(invoiceId, itemId, payload);
      upsertInvoice(updated);
      toast.success(Number(payload.amount) < 0 ? "Reembolso atualizado" : "Item atualizado");
      await syncMonthCollections();
    } catch (error) {
      toast.error(Number(payload.amount) < 0 ? "Erro ao atualizar reembolso" : "Erro ao atualizar item");
      throw error;
    }
  };

  const deleteItem = async (invoiceId, itemId) => {
    try {
      const updated = await deleteInvoiceItem(invoiceId, itemId);
      upsertInvoice(updated);
      toast.success("Item removido");
      await syncMonthCollections();
    } catch {
      toast.error("Erro ao remover item");
    }
  };

  const saveCategory = async (payload) => {
    try {
      const saved = await createCategory(payload);
      setCategories((current) => {
        const next = current.some((category) => category.id === saved.id)
          ? current.map((category) => category.id === saved.id ? saved : category)
          : [...current, saved];
        return next.sort((left, right) => left.name.localeCompare(right.name, language));
      });
      toast.success("Categoria criada");
      return saved;
    } catch (error) {
      toast.error("Erro ao criar categoria");
      throw error;
    }
  };

  const editCategory = async (categoryId, payload) => {
    try {
      const saved = await updateCategory(categoryId, payload);
      setCategories((current) => current
        .map((category) => category.id === saved.id ? saved : category)
        .sort((left, right) => left.name.localeCompare(right.name, language)));
      toast.success("Categoria atualizada");
      if (
        Object.hasOwn(payload, "name")
        || Object.hasOwn(payload, "color")
        || Object.hasOwn(payload, "ignore_in_category_analysis")
        || Object.hasOwn(payload, "include_in_income_planning")
      ) {
        await syncMonthCollections();
      }
      return saved;
    } catch (error) {
      toast.error(String(error?.message || "").includes("already exists") ? "Já existe uma categoria com esse nome" : "Erro ao atualizar categoria");
      throw error;
    }
  };

  const removeCategory = async (categoryId) => {
    try {
      await deleteCategory(categoryId);
      setCategories((current) => current.filter((category) => category.id !== categoryId));
      toast.success("Categoria excluída; os itens vinculados ficaram sem categoria");
      await refresh();
    } catch (error) {
      toast.error("Erro ao excluir categoria");
      throw error;
    }
  };

  const saveBudgetPlanning = async (planPayload, reservePayload) => {
    try {
      await updateMonthlyBudgetPlan(year, month, planPayload);
      const saved = await updateBudgetReserveRule(year, month, reservePayload);
      setBudgetPlan(saved);
      toast.success(t("categories.planningSaved"));
      return saved;
    } catch (error) {
      toast.error(t("categories.planningSaveError"));
      throw error;
    }
  };

  const saveInvoiceDueDate = async (invoiceId, dueDate) => {
    try {
      const updated = await updateInvoice(invoiceId, { due_date: dueDate });
      upsertInvoice(updated);
      toast.success("Data da fatura atualizada");
      await syncMonthCollections();
    } catch (error) {
      toast.error("Erro ao atualizar data da fatura");
      throw error;
    }
  };

  const removeInvoice = async (invoiceId) => {
    try {
      await deleteInvoice(invoiceId);
      setInvoices((current) => current.filter((invoice) => invoice.id !== invoiceId));
      toast.success("Fatura excluída");
      await syncMonthCollections();
    } catch (error) {
      toast.error(error?.status === 409 ? error.message : "Erro ao excluir fatura");
      throw error;
    }
  };

  const toggleInvoicePaid = async (invoiceId, paid) => {
    try {
      const updated = await setInvoicePaid(invoiceId, paid);
      upsertInvoice(updated);
      toast.success(paid ? "Fatura marcada como paga" : "Fatura marcada como pendente");
      await syncMonthCollections();
    } catch {
      toast.error("Erro ao atualizar fatura");
    }
  };

  const openReceivableModal = (receivable = null, expenseOption = null) => {
    if (receivable) {
      const linked = receivable.linked_expense;
      const purchaseId = linked?.purchase_id;
      const purchaseOption = purchaseId
        ? receivableExpenseOptions.find((option) => option.source_type === "installment_purchase" && option.source_id === purchaseId)
        : null;
      const seriesMates = (receivable.series_id
        ? receivables.filter((item) => item.series_id === receivable.series_id)
        : [receivable]
      ).slice().sort((left, right) => (
        Number(left.series_installment_number || 0) - Number(right.series_installment_number || 0)
        || Number(left.id) - Number(right.id)
      ));
      const editAmount = seriesMates.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
      const seriesCount = Math.max(
        Number(receivable.series_installment_count || seriesMates.length || purchaseOption?.installment_count || linked?.installment_count || 1),
        1
      );
      const expenseKey = purchaseOption
        ? `installment_purchase:${purchaseOption.source_id}`
        : linked
          ? `${linked.source_type}:${linked.source_id}`
          : "";
      setEditingReceivable(receivable);
      setReceivableForm({
        person_id: String(receivable.person_id || ""),
        person_name: receivable.person_name || "",
        description: receivable.description,
        total_amount: formatMoney(editAmount || receivable.total_amount, language),
        due_date: seriesMates[0]?.due_date || receivable.due_date,
        category_ids: (receivable.category_ids?.length ? receivable.category_ids : receivable.category_id ? [receivable.category_id] : []).map(String),
        notes: receivable.notes || "",
        expense_source_key: expenseKey,
        installment_scope: purchaseOption ? "all" : linked?.source_type === "installment_item" ? "remaining" : "single",
        allocation_mode: "total",
        series_count: seriesCount,
        installment_amounts: seriesMates.map((item) => formatMoney(item.total_amount, language))
      });
    } else {
      setEditingReceivable(null);
      const initial = defaultReceivableForm();
      if (expenseOption) {
        const purchaseOption = expenseOption.source_type === "installment_item" && expenseOption.purchase_id
          ? receivableExpenseOptions.find((option) => option.source_type === "installment_purchase" && option.source_id === expenseOption.purchase_id)
          : expenseOption.source_type === "installment_purchase" ? expenseOption : null;
        const resolved = purchaseOption || expenseOption;
        const installmentRemainder = expenseOption.source_type === "installment_item" && !purchaseOption
          ? receivableExpenseOptions
              .filter((option) => option.source_type === "installment_item" && option.purchase_id === expenseOption.purchase_id && Number(option.installment_number) >= Number(expenseOption.installment_number))
              .reduce((sum, option) => sum + Number(option.available_amount || 0), 0)
          : null;
        initial.description = resolved.description || "";
        initial.total_amount = formatMoney(purchaseOption?.available_amount || installmentRemainder || resolved.available_amount || resolved.amount, language);
        initial.due_date = resolved.date || initial.due_date;
        initial.category_ids = (resolved.category_ids?.length ? resolved.category_ids : resolved.category_id ? [resolved.category_id] : []).map(String);
        initial.expense_source_key = `${resolved.source_type}:${resolved.source_id}`;
        initial.installment_scope = resolved.source_type === "installment_purchase" ? "all" : resolved.source_type === "installment_item" ? "remaining" : "single";
        initial.series_count = Math.max(Number(resolved.installment_count || 1), 1);
      }
      setReceivableForm(initial);
    }
    setReceivableModal(true);
    void ensureExtras(["people", "categories", "expenseOptions"]);
  };

  const manageExpenseReceivable = (expenseOption) => {
    if (!expenseOption) return;
    const existing = expenseOption.receivable_ids?.map((id) => receivables.find((item) => item.id === id)).find(Boolean);
    setDrawerOpen(false);
    setEditing(null);
    if (existing) openReceivableModal(existing);
    else openReceivableModal(null, expenseOption);
  };

  const editLinkedReceivableTransaction = (transaction) => {
    openTransactionEditor(transaction);
  };

  const saveReceivable = async (payload) => {
    try {
      let personId = payload.person_id;
      if (personId === CREATE_RECEIVABLE_PERSON_VALUE) {
        const person = await createReceivablePerson({ name: payload.person_name.trim() });
        personId = String(person.id);
      }
      const data = {
        person_id: Number(personId),
        description: payload.description.trim(),
        total_amount: parseTypedMoneyInput(payload.total_amount, language),
        due_date: payload.due_date,
        category_ids: (payload.category_ids || []).map(Number),
        notes: payload.notes?.trim() || null,
        series_count: Math.max(Number(payload.series_count) || 1, 1),
        allocation_mode: payload.allocation_mode || "total",
        ...(Array.isArray(payload.installment_amounts) && payload.installment_amounts.length > 1
          ? { installment_amounts: payload.installment_amounts }
          : {}),
        expense_link: payload.expense_source_key ? (() => {
          const [sourceType, sourceId] = payload.expense_source_key.split(":");
          return {
            source_type: sourceType,
            source_id: Number(sourceId),
            installment_scope: payload.installment_scope || (sourceType === "installment_purchase" ? "all" : "single"),
            allocation_mode: payload.allocation_mode || "total"
          };
        })() : null
      };
      if (editingReceivable) await updateReceivable(editingReceivable.id, data);
      else await createReceivable(data);
      setReceivableModal(false);
      setEditingReceivable(null);
      setReceivableForm(defaultReceivableForm());
      toast.success(editingReceivable ? "Conta a receber atualizada" : "Conta a receber criada");
      await syncReceivableCollections();
    } catch (error) {
      toast.error(error?.message?.includes("exceeds expense amount") ? "O valor excede a parte disponível deste gasto." : "Erro ao salvar conta a receber");
    }
  };

  const openReceivablePaidModal = (receivable) => {
    setReceivablePayment({
      mode: "paid",
      receivable,
      amount: formatMoney(receivable.remaining_amount, language),
      paid_at: todayIsoDate(),
      category_ids: (receivable.category_ids?.length ? receivable.category_ids : receivable.category_id ? [receivable.category_id] : []).map(String)
    });
  };

  const openReceivablePaymentModal = (receivable) => {
    setReceivablePayment({
      mode: "partial",
      receivable,
      amount: "",
      paid_at: todayIsoDate(),
      category_ids: (receivable.category_ids?.length ? receivable.category_ids : receivable.category_id ? [receivable.category_id] : []).map(String)
    });
  };

  const saveReceivablePayment = async (payload) => {
    try {
      if (payload.mode === "paid") {
        await markReceivablePaid(payload.receivable.id, { paid_at: payload.paid_at, category_ids: (payload.category_ids || []).map(Number) });
      } else {
        await createReceivablePayment(payload.receivable.id, {
          amount: parseTypedMoneyInput(payload.amount, language),
          paid_at: payload.paid_at,
          category_ids: (payload.category_ids || []).map(Number)
        });
      }
      setReceivablePayment(null);
      toast.success(payload.mode === "paid" ? "Conta marcada como paga" : "Pagamento parcial registrado");
      await Promise.all([syncReceivableCollections(), syncMonthCollections()]);
    } catch {
      toast.error("Erro ao registrar pagamento");
    }
  };

  const removeReceivable = async (receivable) => {
    if (receivable.payments?.length) {
      toast.error("Cancele ou exclua os pagamentos antes de excluir este recebível.");
      return;
    }
    try {
      await deleteReceivable(receivable.id);
      setReceivableToDelete(null);
      toast.success("Recebível excluído");
      await syncReceivableCollections();
    } catch {
      toast.error("Erro ao excluir recebível");
    }
  };

  const removeReceivablePayment = async (receivable, payment) => {
    try {
      await deleteReceivablePayment(receivable.id, payment.id);
      setPaymentToCancel(null);
      toast.success("Pagamento cancelado");
      await Promise.all([syncReceivableCollections(), syncMonthCollections()]);
    } catch {
      toast.error("Erro ao cancelar pagamento");
    }
  };

  return (
    <div className={`app-layout ${menuOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <Toaster position="top-right" />
      <Sidebar open={menuOpen} setOpen={setMenuOpen} />
      <header className="mobile-topbar">
        <button className="mobile-menu-btn" type="button" onClick={() => setMenuOpen(true)} aria-label={t("sidebar.expand")}>
          <Menu size={22} />
        </button>
        <Link className="mobile-topbar-brand" to="/" aria-label="Kashy365">
          <img src={BRAND_MARK_SRC} alt="" aria-hidden="true" />
          <span><strong>Kashy</strong>365</span>
        </Link>
      </header>
      <main className="content">
        <div className="content-inner">
          {showMonthHeader && (
            <header className={`page-header ${viewingBudget ? "budget-page-header" : ""}`}>
              <div>
                <p className="eyebrow">{formatMonthLabel(year, month, language)}</p>
                <h1><span className="page-title-default">{t("app.title")}</span>{viewingBudget && <span className="budget-mobile-title">{t("categories.mobileTitle")}</span>}</h1>
              </div>
              <div className="toolbar" data-months-tour={location.pathname === "/meses" ? "period" : undefined}>
                {!viewingCurrentMonth && (
                  <button className="btn month-current-btn" type="button" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); }}>
                    <CalendarClock size={16} /> {t("actions.currentMonth")}
                  </button>
                )}
                <button className="btn month-nav-button" type="button" aria-label={t("actions.previous")} onClick={() => { const target = shiftMonth(year, month, -1); setYear(target.year); setMonth(target.month); }}><ChevronLeft className="month-nav-icon" size={22} /><span>{t("actions.previous")}</span></button>
                <MonthField value={monthInputValue} displayLabel={viewingBudget ? formatMonthLabel(year, month, language) : ""} ariaLabel={viewingBudget ? t("categories.chooseMonth") : ""} onChange={(value) => { const [y, m] = value.split("-").map(Number); if (y && m) { setYear(y); setMonth(m); } }} />
                <button className="btn month-nav-button" type="button" aria-label={t("actions.next")} onClick={() => { const target = shiftMonth(year, month, 1); setYear(target.year); setMonth(target.month); }}><ChevronRight className="month-nav-icon" size={22} /><span>{t("actions.next")}</span></button>
                <button className="btn btn-primary header-new-btn" data-months-tour={location.pathname === "/meses" ? "new" : undefined} type="button" onClick={() => openAddForm()}><Plus size={16} /> {t("actions.new")}</button>
              </div>
            </header>
          )}

          {loading ? <Skeleton variant={loadingVariant} label={loadingLabel} hint={loadingHint} /> : (
            <Routes>
              <Route path="/" element={<Dashboard summary={summary} balanceSeries={balanceSeries} comparisons={comparisonView} invoices={invoices} monthData={monthData} categories={categories} categoryBreakdown={categoryBreakdown} historyLoading={historyLoading} categoriesLoading={categoriesLoading} loadError={dashboardLoadError} onRetry={() => refresh()} onLoadCategoryDetails={loadCategoryExpenseDetails} onOpenTransaction={openTransactionEditor} onNewTransaction={() => openAddForm()} activeSection={dashboardSection} onActiveSectionChange={setDashboardSection} />} />
              <Route path="/meses" element={<MonthsPage monthData={monthData} summary={summary} monthCards={monthCards} invoices={invoices} expenseOptions={receivableExpenseOptions} year={year} month={month} setYear={setYear} setMonth={setMonth} openAddForm={openAddForm} onEditTransaction={openTransactionEditor} removeTransaction={setTransactionToDelete} onOpenReceivable={openReceivableDetails} onLoadCategoryDetails={loadCategoryExpenseDetails} onOverlayChange={setPageOverlayOpen} />} />
              <Route path="/categorias" element={<CategoriesPage categories={categories} categoryBreakdown={categoryBreakdown} previousCategoryBreakdown={previousCategoryBreakdown} budgetPlan={budgetPlan} mobileTab={budgetMobileTab} onMobileTabChange={setBudgetMobileTab} onLoadExpenseDetails={loadCategoryExpenseDetails} onUpdateCategory={editCategory} onSavePlanning={saveBudgetPlanning} />} />
              <Route path="/carteiras" element={<WalletsPage summary={walletSummary} onChanged={syncMonthCollections} onOverlayChange={setPageOverlayOpen} />} />
              <Route path="/faturas" element={<InvoicesPage invoices={invoices} categories={categories} expenseOptions={receivableExpenseOptions} onManageReceivable={manageExpenseReceivable} onCreateCategory={saveCategory} onLoadCategoryDetails={loadCategoryExpenseDetails} onLoadInvoiceItems={loadInvoiceDetails} onEnsureExpenseContext={() => ensureExtras(["expenseOptions"])} onOverlayChange={setPageOverlayOpen} allowOverdueInvoiceEdits={allowOverdueInvoiceEdits} addItem={addItem} updateItem={saveItem} updateDueDate={saveInvoiceDueDate} createInstallment={createNewInstallment} deleteItem={deleteItem} deleteInstallmentItem={removeInstallmentItem} togglePaid={toggleInvoicePaid} deleteInvoice={removeInvoice} openModal={openNewInvoiceModal} onViewInstallment={showInstallmentDetails} />} />
              <Route path="/modelos-de-fatura" element={<Navigate to="/configuracoes?secao=modelos" replace />} />
              <Route path="/parcelamentos" element={<InstallmentsPage categories={categories} invoices={invoices} revision={installmentsRevision} onNew={() => openInstallmentModal()} onDetails={showInstallmentDetails} onRequestDelete={requestInstallmentDelete} />} />
              <Route path="/simulador" element={<SimulationPage invoices={invoices} allowOverdueInvoiceEdits={allowOverdueInvoiceEdits} monthCards={monthCards} onInserted={refresh} />} />
              <Route path="/recebiveis" element={<ReceivablesPage receivables={receivables} linkedTransactions={linkedReceivableTransactions} onNew={() => openReceivableModal()} onEdit={openReceivableModal} onEditLinkedTransaction={editLinkedReceivableTransaction} onPaid={openReceivablePaidModal} onPayment={openReceivablePaymentModal} onDelete={(receivable) => receivable.payments?.length ? removeReceivable(receivable) : setReceivableToDelete(receivable)} onDeletePayment={(receivable, payment) => setPaymentToCancel({ receivable, payment })} onOverlayChange={setPageOverlayOpen} actionOverlayOpen={receivableModal || !!receivablePayment || !!paymentToCancel || !!receivableToDelete} />} />
              <Route path="/contas-a-receber" element={<Navigate to="/recebiveis" replace />} />
              <Route path="/configuracoes" element={<SettingsPage summary={summary} monthLabel={formatMonthLabel(year, month, language)} monthData={monthData} year={year} month={month} categories={categories} invoiceTemplates={invoiceTemplates} onCreateCategory={saveCategory} onUpdateCategory={editCategory} onDeleteCategory={removeCategory} onSaveInvoiceTemplate={saveInvoiceTemplate} onToggleInvoiceTemplate={toggleTemplate} onDeleteInvoiceTemplate={removeTemplate} refresh={refresh} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </div>
      </main>

      <TransactionForm open={drawerOpen && !isInvoiceTransaction(editing)} initial={editing} date={selectedDate} categories={categories} wallets={walletSummary.wallets} expenseOption={editing ? receivableExpenseOptions.find((option) => option.source_type === "transaction" && option.source_id === editing.id) : null} expenseOptions={receivableExpenseOptions} onManageReceivable={manageExpenseReceivable} onCreateCategory={saveCategory} onOpenBatch={() => { setDrawerOpen(false); setBatchModalOpen(true); }} onClose={() => setDrawerOpen(false)} onSave={saveTransaction} />
      <BatchTransactionModal open={batchModalOpen} year={year} month={month} categories={categories} wallets={walletSummary.wallets} onCreateCategory={saveCategory} onOpenSingle={() => { setBatchModalOpen(false); openAddForm(selectedDate || todayIsoDate()); }} onClose={() => setBatchModalOpen(false)} onSave={saveTransactionBatch} />
      {invoiceModal && <InvoiceModal form={invoiceForm} setForm={setInvoiceForm} templates={invoiceTemplates.filter((template) => template.active)} wallets={walletSummary.wallets} onCreateTemplate={(payload) => saveInvoiceTemplate(payload)} onSubmit={createNewInvoice} onClose={() => setInvoiceModal(false)} />}
      {installmentModal && <InstallmentModal form={installmentForm} setForm={setInstallmentForm} invoices={invoices} categories={categories} onCreateCategory={saveCategory} allowOverdueInvoiceEdits={allowOverdueInvoiceEdits} onSubmit={createNewInstallment} onClose={() => setInstallmentModal(false)} />}
      {installmentDetails && <InstallmentDetailsModal purchase={installmentDetails} invoices={invoices} categories={categories} onCreateCategory={saveCategory} allowOverdueInvoiceEdits={allowOverdueInvoiceEdits} onClose={() => setInstallmentDetails(null)} onRequestDelete={requestInstallmentDelete} onSaveItem={saveInstallmentItem} onSaveCategory={saveInstallmentCategory} />}
      {installmentToDelete && <DeleteInstallmentModal purchase={installmentToDelete} deleting={deletingInstallment} onClose={() => setInstallmentToDelete(null)} onConfirm={() => removeInstallment(installmentToDelete.id)} />}
      {receivableDetailsGroup && (
        <ReceivableDetailsModal
          group={receivableDetailsGroup}
          busy={receivableModal || !!receivablePayment || !!paymentToCancel || !!receivableToDelete}
          onClose={() => setReceivableDetailsId(null)}
          onEdit={openReceivableModal}
          onPaid={openReceivablePaidModal}
          onPayment={openReceivablePaymentModal}
          onDelete={(receivable) => receivable.payments?.length ? removeReceivable(receivable) : setReceivableToDelete(receivable)}
          onDeletePayment={(receivable, payment) => setPaymentToCancel({ receivable, payment })}
        />
      )}
      {receivableModal && <ReceivableModal form={receivableForm} setForm={setReceivableForm} editing={editingReceivable} receivables={receivables} people={receivablePeople} categories={categories} expenseOptions={receivableExpenseOptions} onCreateCategory={saveCategory} onSubmit={saveReceivable} onClose={() => { setReceivableModal(false); setEditingReceivable(null); }} />}
      {receivablePayment && <ReceivablePaymentModal data={receivablePayment} setData={setReceivablePayment} categories={categories} onCreateCategory={saveCategory} onSubmit={saveReceivablePayment} onClose={() => setReceivablePayment(null)} />}
      {paymentToCancel && <CancelReceivablePaymentModal data={paymentToCancel} onClose={() => setPaymentToCancel(null)} onConfirm={() => removeReceivablePayment(paymentToCancel.receivable, paymentToCancel.payment)} />}
      {receivableToDelete && <DeleteReceivableModal receivable={receivableToDelete} onClose={() => setReceivableToDelete(null)} onConfirm={() => removeReceivable(receivableToDelete)} />}
      {transactionToDelete && <DeleteTransactionModal transaction={transactionToDelete} onClose={() => setTransactionToDelete(null)} onConfirm={() => removeTransaction(transactionToDelete.id)} />}
    </div>
  );
}


