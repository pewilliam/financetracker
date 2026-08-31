import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";
import { Menu, Plus } from "lucide-react";
import Dashboard from "../Dashboard.jsx";
import { MonthField } from "../DateField.jsx";
import TransactionForm from "../TransactionForm.jsx";
import Sidebar from "./Sidebar.jsx";
import Skeleton from "../common/Skeleton.jsx";
import MonthsPage from "../../pages/MonthsPage.jsx";
import InvoicesPage from "../../pages/InvoicesPage.jsx";
import InstallmentsPage from "../../pages/InstallmentsPage.jsx";
import SimulationPage from "../../pages/SimulationPage.jsx";
import ReceivablesPage from "../../pages/ReceivablesPage.jsx";
import CategoriesPage from "../../pages/CategoriesPage.jsx";
import SettingsPage from "../../pages/SettingsPage.jsx";
import InvoiceModal from "../../modals/InvoiceModal.jsx";
import InstallmentModal from "../../modals/InstallmentModal.jsx";
import InstallmentDetailsModal from "../../modals/InstallmentDetailsModal.jsx";
import ReceivableModal from "../../modals/ReceivableModal.jsx";
import ReceivablePaymentModal from "../../modals/ReceivablePaymentModal.jsx";
import CancelReceivablePaymentModal from "../../modals/CancelReceivablePaymentModal.jsx";
import DeleteReceivableModal from "../../modals/DeleteReceivableModal.jsx";
import DeleteTransactionModal from "../../modals/DeleteTransactionModal.jsx";
import { useI18n } from "../../i18n/index.ts";
import { useAuth } from "../../hooks/useAuth.jsx";
import { BRAND_MARK_SRC, CREATE_RECEIVABLE_PERSON_VALUE, MOBILE_MEDIA_QUERY } from "../../app/constants.js";
import { defaultInstallmentForm, defaultInvoiceForm, defaultReceivableForm, isMobileViewport, nextDueDateFromDay, nextMonthDate, normalizeTransactionPayload, shiftMonth, todayIsoDate } from "../../app/helpers.js";
import { addInvoiceItem, createCategory, createInstallment, createInvoice, createInvoiceTemplate, createReceivable, createReceivablePayment, createReceivablePerson, createRecurrence, createTransaction, deleteCategory, deleteInstallment, deleteInstallmentItem, deleteInvoiceItem, deleteInvoiceTemplate, deleteReceivable, deleteReceivablePayment, deleteTransaction, getCategoryBreakdown, getInstallment, getMonth, getMonthlyBudgetPlan, getMonthSummary, getMonthsSummary, listCategories, listInstallments, listInvoices, listInvoiceTemplates, listLinkedReceivableTransactions, listReceivableExpenseOptions, listReceivablePeople, listReceivables, markReceivablePaid, setInvoicePaid, toggleInvoiceTemplate, updateBudgetReserveRule, updateCategory, updateInstallmentCategory, updateInstallmentItem, updateInvoice, updateInvoiceItem, updateInvoiceTemplate, updateMonthlyBudgetPlan, updateReceivable, updateRecurrence, updateTransaction } from "../../api/api.js";
import { formatMoney, formatMonthLabel, parseTypedMoneyInput } from "../../utils/format.js";

export default function AppShell() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const location = useLocation();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [monthData, setMonthData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [comparisons, setComparisons] = useState([]);
  const [monthCards, setMonthCards] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoiceTemplates, setInvoiceTemplates] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState({ total_expenses: 0, categorized_total: 0, items: [], total_income: 0, income_categorized_total: 0, income_items: [] });
  const [previousCategoryBreakdown, setPreviousCategoryBreakdown] = useState({ total_expenses: 0, categorized_total: 0, items: [], total_income: 0, income_categorized_total: 0, income_items: [] });
  const [budgetPlan, setBudgetPlan] = useState(null);
  const [receivables, setReceivables] = useState([]);
  const [linkedReceivableTransactions, setLinkedReceivableTransactions] = useState([]);
  const [receivablePeople, setReceivablePeople] = useState([]);
  const [receivableExpenseOptions, setReceivableExpenseOptions] = useState([]);
  const [loading, setLoading] = useState(true);
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
  const [editing, setEditing] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(defaultInvoiceForm);
  const [installmentModal, setInstallmentModal] = useState(false);
  const [installmentForm, setInstallmentForm] = useState(defaultInstallmentForm);
  const [installmentDetails, setInstallmentDetails] = useState(null);
  const [receivableModal, setReceivableModal] = useState(false);
  const [receivableForm, setReceivableForm] = useState(defaultReceivableForm);
  const [editingReceivable, setEditingReceivable] = useState(null);
  const [receivablePayment, setReceivablePayment] = useState(null);
  const [paymentToCancel, setPaymentToCancel] = useState(null);
  const [receivableToDelete, setReceivableToDelete] = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);

  const monthInputValue = `${year}-${String(month).padStart(2, "0")}`;
  const allowOverdueInvoiceEdits = Boolean(user?.allow_overdue_invoice_edits);
  const showMonthHeader = location.pathname === "/" || location.pathname === "/meses" || location.pathname === "/categorias";
  const overlayOpen = drawerOpen || invoiceModal || installmentModal || !!installmentDetails || receivableModal || !!receivablePayment || !!paymentToCancel || !!receivableToDelete || !!transactionToDelete;
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

  async function refresh({ showLoading = true } = {}) {
    if (showLoading) setLoading(true);
    try {
      const offsets = [-5, -4, -3, -2, -1, 0];
      const previousTarget = shiftMonth(year, month, -1);
      const [monthPayload, summaryPayload, invoicesPayload, templatesPayload, installmentsPayload, categoriesPayload, categoryBreakdownPayload, previousCategoryBreakdownPayload, budgetPlanPayload, receivablesPayload, linkedReceivablesPayload, peoplePayload, expenseOptionsPayload, monthCardsPayload, comparisonPayload] = await Promise.all([
        getMonth(year, month),
        getMonthSummary(year, month),
        listInvoices(),
        listInvoiceTemplates(),
        listInstallments(),
        listCategories(),
        getCategoryBreakdown(year, month),
        getCategoryBreakdown(previousTarget.year, previousTarget.month),
        getMonthlyBudgetPlan(year, month),
        listReceivables(),
        listLinkedReceivableTransactions(),
        listReceivablePeople(),
        listReceivableExpenseOptions(),
        getMonthsSummary(),
        Promise.all(offsets.map(async (offset) => {
          const target = shiftMonth(year, month, offset);
          const data = await getMonthSummary(target.year, target.month);
          return { label: formatMonthLabel(target.year, target.month, language).slice(0, 3), ...data };
        }))
      ]);
      setMonthData(monthPayload);
      setSummary(summaryPayload);
      setInvoices(invoicesPayload);
      setInvoiceTemplates(templatesPayload);
      setInstallments(installmentsPayload);
      setCategories(categoriesPayload);
      setCategoryBreakdown(categoryBreakdownPayload);
      setPreviousCategoryBreakdown(previousCategoryBreakdownPayload);
      setBudgetPlan(budgetPlanPayload);
      setReceivables(receivablesPayload);
      setLinkedReceivableTransactions(linkedReceivablesPayload);
      setReceivablePeople(peoplePayload);
      setReceivableExpenseOptions(expenseOptionsPayload);
      setMonthCards(monthCardsPayload);
      setComparisons(comparisonPayload);
    } catch (error) {
      toast.error(t("toasts.loadDataError"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [year, month, language]);

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
    const [invoicesPayload, installmentsPayload] = await Promise.all([
      listInvoices(),
      listInstallments()
    ]);
    setInvoices(invoicesPayload);
    setInstallments(installmentsPayload);
  };

  const syncMonthCollections = async () => {
    const offsets = [-5, -4, -3, -2, -1, 0];
    const previousTarget = shiftMonth(year, month, -1);
    const [monthPayload, summaryPayload, categoryBreakdownPayload, previousCategoryBreakdownPayload, budgetPlanPayload, linkedReceivablesPayload, expenseOptionsPayload, monthCardsPayload, comparisonPayload] = await Promise.all([
      getMonth(year, month),
      getMonthSummary(year, month),
      getCategoryBreakdown(year, month),
      getCategoryBreakdown(previousTarget.year, previousTarget.month),
      getMonthlyBudgetPlan(year, month),
      listLinkedReceivableTransactions(),
      listReceivableExpenseOptions(),
      getMonthsSummary(),
      Promise.all(offsets.map(async (offset) => {
        const target = shiftMonth(year, month, offset);
        const data = await getMonthSummary(target.year, target.month);
        return { label: formatMonthLabel(target.year, target.month, language).slice(0, 3), ...data };
      }))
    ]);
    setMonthData(monthPayload);
    setSummary(summaryPayload);
    setCategoryBreakdown(categoryBreakdownPayload);
    setPreviousCategoryBreakdown(previousCategoryBreakdownPayload);
    setBudgetPlan(budgetPlanPayload);
    setLinkedReceivableTransactions(linkedReceivablesPayload);
    setReceivableExpenseOptions(expenseOptionsPayload);
    setMonthCards(monthCardsPayload);
    setComparisons(comparisonPayload);
  };

  const syncInvoiceAndMonthCollections = async () => {
    await Promise.all([
      syncInvoiceCollections(),
      syncMonthCollections()
    ]);
  };

  const balanceSeries = useMemo(() => monthData?.days?.map((day) => ({ date: day.date, balance: day.balance })) || [], [monthData]);

  const openAddForm = (dateString = todayIsoDate()) => {
    setSelectedDate(dateString);
    setEditing(null);
    setDrawerOpen(true);
  };

  const saveTransaction = async (payload) => {
    try {
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
            category_id: normalizedData.category_id
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
            category_id: normalizedData.category_id
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
        initial_amount: parseTypedMoneyInput(draft.initial_amount, language),
        category_id: draft.category_id ? Number(draft.category_id) : null
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

  const openNewInvoiceModal = () => {
    const activeTemplate = invoiceTemplates.find((template) => template.active);
    setInvoiceForm(activeTemplate ? { ...defaultInvoiceForm(), template_id: String(activeTemplate.id), due_date: nextDueDateFromDay(activeTemplate.default_due_day) } : defaultInvoiceForm());
    setInvoiceModal(true);
  };

  const openDuplicateInvoiceModal = (invoice) => {
    setInvoiceForm({
      template_id: String(invoice.template_id),
      due_date: nextMonthDate(invoice.due_date),
      initial_amount: formatMoney(invoice.total_amount, language),
      duplicate_next_month: false,
      duplicate_months: 1
    });
    setInvoiceModal(true);
  };

  const saveInvoiceTemplate = async (payload, id = null) => {
    const saved = id ? await updateInvoiceTemplate(id, payload) : await createInvoiceTemplate(payload);
    const templatesPayload = await listInvoiceTemplates();
    setInvoiceTemplates(templatesPayload);
    return saved;
  };

  const toggleTemplate = async (template) => {
    if (template.active && !window.confirm(`Desativar ${template.name}? As faturas existentes continuam, mas não será possível criar novas.`)) return;
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
      setInstallmentForm(defaultInstallmentForm());
      setInstallmentModal(false);
      toast.success("Compra parcelada criada");
      await syncInvoiceAndMonthCollections();
    } catch (error) {
      toast.error(String(error?.message || "").includes("Invoice no longer accepts") ? "A fatura escolhida não aceita novos itens" : "Erro ao criar compra parcelada");
    }
  };

  const removeInstallment = async (id) => {
    try {
      await deleteInstallment(id);
      setInstallmentDetails(null);
      toast.success("Compra parcelada removida");
      await syncInvoiceAndMonthCollections();
    } catch {
      toast.error("Erro ao remover compra parcelada");
    }
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
      setInstallments((current) => current.map((purchase) => purchase.id === updated.id ? updated : purchase));
      toast.success("Parcela atualizada");
      await syncInvoiceAndMonthCollections();
    } catch (error) {
      toast.error(String(error?.message || "").includes("Invoice no longer accepts") ? "A fatura escolhida não aceita novos itens" : "Erro ao atualizar parcela");
      throw error;
    }
  };

  const saveInstallmentCategory = async (id, categoryId) => {
    try {
      const updated = await updateInstallmentCategory(id, categoryId);
      setInstallmentDetails(updated);
      setInstallments((current) => current.map((purchase) => purchase.id === updated.id ? updated : purchase));
      toast.success(categoryId ? "Categoria da compra atualizada" : "Categoria removida da compra");
      await syncInvoiceAndMonthCollections();
      return updated;
    } catch (error) {
      toast.error("Erro ao atualizar categoria da compra");
      throw error;
    }
  };

  const showInstallmentDetails = async (id) => {
    try {
      setInstallmentDetails(await getInstallment(id));
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
      if (Object.hasOwn(payload, "name") || Object.hasOwn(payload, "color")) {
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
      await Promise.all([
        updateMonthlyBudgetPlan(year, month, planPayload),
        updateBudgetReserveRule(year, month, reservePayload),
      ]);
      const saved = await getMonthlyBudgetPlan(year, month);
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
      setEditingReceivable(receivable);
      setReceivableForm({
        person_id: String(receivable.person_id || ""),
        person_name: receivable.person_name || "",
        description: receivable.description,
        total_amount: formatMoney(receivable.total_amount, language),
        due_date: receivable.due_date,
        category_id: receivable.category_id ? String(receivable.category_id) : "",
        notes: receivable.notes || "",
        expense_source_key: receivable.linked_expense ? `${receivable.linked_expense.source_type}:${receivable.linked_expense.source_id}` : "",
        installment_scope: "single",
        allocation_mode: "total"
      });
    } else {
      setEditingReceivable(null);
      const initial = defaultReceivableForm();
      if (expenseOption) {
        const installmentRemainder = expenseOption.source_type === "installment_item"
          ? receivableExpenseOptions
              .filter((option) => option.source_type === "installment_item" && option.purchase_id === expenseOption.purchase_id && Number(option.installment_number) >= Number(expenseOption.installment_number))
              .reduce((sum, option) => sum + Number(option.available_amount || 0), 0)
          : null;
        initial.description = expenseOption.description || "";
        initial.total_amount = formatMoney(installmentRemainder || expenseOption.available_amount || expenseOption.amount, language);
        initial.due_date = expenseOption.date || initial.due_date;
        initial.category_id = expenseOption.category_id ? String(expenseOption.category_id) : "";
        initial.expense_source_key = `${expenseOption.source_type}:${expenseOption.source_id}`;
        initial.installment_scope = expenseOption.source_type === "installment_item" ? "remaining" : expenseOption.source_type === "installment_purchase" ? "all" : "single";
      }
      setReceivableForm(initial);
    }
    setReceivableModal(true);
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
    setSelectedDate(transaction.date);
    setEditing(transaction);
    setDrawerOpen(true);
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
        category_id: payload.category_id ? Number(payload.category_id) : null,
        notes: payload.notes?.trim() || null,
        expense_link: payload.expense_source_key ? (() => {
          const [sourceType, sourceId] = payload.expense_source_key.split(":");
          return {
            source_type: sourceType,
            source_id: Number(sourceId),
            installment_scope: payload.installment_scope || "single",
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
      await refresh();
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
      category_id: receivable.category_id ? String(receivable.category_id) : ""
    });
  };

  const openReceivablePaymentModal = (receivable) => {
    setReceivablePayment({
      mode: "partial",
      receivable,
      amount: "",
      paid_at: todayIsoDate(),
      category_id: receivable.category_id ? String(receivable.category_id) : ""
    });
  };

  const saveReceivablePayment = async (payload) => {
    try {
      if (payload.mode === "paid") {
        await markReceivablePaid(payload.receivable.id, { paid_at: payload.paid_at, category_id: payload.category_id ? Number(payload.category_id) : null });
      } else {
        await createReceivablePayment(payload.receivable.id, {
          amount: parseTypedMoneyInput(payload.amount, language),
          paid_at: payload.paid_at,
          category_id: payload.category_id ? Number(payload.category_id) : null
        });
      }
      setReceivablePayment(null);
      toast.success(payload.mode === "paid" ? "Conta marcada como paga" : "Pagamento parcial registrado");
      await refresh();
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
      await refresh();
    } catch {
      toast.error("Erro ao excluir recebível");
    }
  };

  const removeReceivablePayment = async (receivable, payment) => {
    try {
      await deleteReceivablePayment(receivable.id, payment.id);
      setPaymentToCancel(null);
      toast.success("Pagamento cancelado");
      await refresh();
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
            <header className="page-header">
              <div>
                <p className="eyebrow">{formatMonthLabel(year, month, language)}</p>
                <h1>{t("app.title")}</h1>
              </div>
              <div className="toolbar">
                <button className="btn" onClick={() => { const target = shiftMonth(year, month, -1); setYear(target.year); setMonth(target.month); }}>{t("actions.previous")}</button>
                <MonthField value={monthInputValue} onChange={(value) => { const [y, m] = value.split("-").map(Number); if (y && m) { setYear(y); setMonth(m); } }} />
                <button className="btn" onClick={() => { const target = shiftMonth(year, month, 1); setYear(target.year); setMonth(target.month); }}>{t("actions.next")}</button>
                <button className="btn btn-primary header-new-btn" onClick={() => openAddForm()}><Plus size={16} /> {t("actions.new")}</button>
              </div>
            </header>
          )}

          {loading ? <Skeleton /> : (
            <Routes>
              <Route path="/" element={<Dashboard summary={summary} balanceSeries={balanceSeries} comparisons={comparisons} invoices={invoices} monthData={monthData} categoryBreakdown={categoryBreakdown} />} />
              <Route path="/meses" element={<MonthsPage monthData={monthData} summary={summary} monthCards={monthCards} year={year} month={month} setYear={setYear} setMonth={setMonth} openAddForm={openAddForm} setEditing={setEditing} setDrawerOpen={setDrawerOpen} removeTransaction={setTransactionToDelete} />} />
              <Route path="/categorias" element={<CategoriesPage categories={categories} categoryBreakdown={categoryBreakdown} previousCategoryBreakdown={previousCategoryBreakdown} budgetPlan={budgetPlan} onUpdateCategory={editCategory} onSavePlanning={saveBudgetPlanning} />} />
              <Route path="/faturas" element={<InvoicesPage invoices={invoices} categories={categories} expenseOptions={receivableExpenseOptions} onManageReceivable={manageExpenseReceivable} onCreateCategory={saveCategory} allowOverdueInvoiceEdits={allowOverdueInvoiceEdits} addItem={addItem} updateItem={saveItem} updateDueDate={saveInvoiceDueDate} addInstallment={openInstallmentModal} deleteItem={deleteItem} deleteInstallmentItem={removeInstallmentItem} togglePaid={toggleInvoicePaid} openModal={openNewInvoiceModal} openInstallmentModal={() => openInstallmentModal()} openDuplicateInvoiceModal={openDuplicateInvoiceModal} onViewInstallment={showInstallmentDetails} />} />
              <Route path="/modelos-de-fatura" element={<Navigate to="/configuracoes?secao=modelos" replace />} />
              <Route path="/parcelamentos" element={<InstallmentsPage installments={installments} onNew={() => openInstallmentModal()} onDetails={showInstallmentDetails} />} />
              <Route path="/simulador" element={<SimulationPage invoices={invoices} allowOverdueInvoiceEdits={allowOverdueInvoiceEdits} monthCards={monthCards} onInserted={refresh} />} />
              <Route path="/recebiveis" element={<ReceivablesPage receivables={receivables} linkedTransactions={linkedReceivableTransactions} onNew={() => openReceivableModal()} onEdit={openReceivableModal} onEditLinkedTransaction={editLinkedReceivableTransaction} onPaid={openReceivablePaidModal} onPayment={openReceivablePaymentModal} onDelete={(receivable) => receivable.payments?.length ? removeReceivable(receivable) : setReceivableToDelete(receivable)} onDeletePayment={(receivable, payment) => setPaymentToCancel({ receivable, payment })} />} />
              <Route path="/contas-a-receber" element={<Navigate to="/recebiveis" replace />} />
              <Route path="/configuracoes" element={<SettingsPage summary={summary} monthLabel={formatMonthLabel(year, month, language)} monthData={monthData} year={year} month={month} categories={categories} invoiceTemplates={invoiceTemplates} onCreateCategory={saveCategory} onUpdateCategory={editCategory} onDeleteCategory={removeCategory} onSaveInvoiceTemplate={saveInvoiceTemplate} onToggleInvoiceTemplate={toggleTemplate} onDeleteInvoiceTemplate={removeTemplate} refresh={refresh} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </div>
      </main>

      <TransactionForm open={drawerOpen} initial={editing} date={selectedDate} categories={categories} expenseOption={editing ? receivableExpenseOptions.find((option) => option.source_type === "transaction" && option.source_id === editing.id) : null} expenseOptions={receivableExpenseOptions} onManageReceivable={manageExpenseReceivable} onCreateCategory={saveCategory} onClose={() => setDrawerOpen(false)} onSave={saveTransaction} />
      {invoiceModal && <InvoiceModal form={invoiceForm} setForm={setInvoiceForm} templates={invoiceTemplates.filter((template) => template.active)} categories={categories} onCreateCategory={saveCategory} onCreateTemplate={(payload) => saveInvoiceTemplate(payload)} onSubmit={createNewInvoice} onClose={() => setInvoiceModal(false)} />}
      {installmentModal && <InstallmentModal form={installmentForm} setForm={setInstallmentForm} invoices={invoices} categories={categories} onCreateCategory={saveCategory} allowOverdueInvoiceEdits={allowOverdueInvoiceEdits} onSubmit={createNewInstallment} onClose={() => setInstallmentModal(false)} />}
      {installmentDetails && <InstallmentDetailsModal purchase={installmentDetails} invoices={invoices} categories={categories} onCreateCategory={saveCategory} allowOverdueInvoiceEdits={allowOverdueInvoiceEdits} onClose={() => setInstallmentDetails(null)} onDelete={removeInstallment} onSaveItem={saveInstallmentItem} onSaveCategory={saveInstallmentCategory} />}
      {receivableModal && <ReceivableModal form={receivableForm} setForm={setReceivableForm} editing={editingReceivable} people={receivablePeople} categories={categories} expenseOptions={receivableExpenseOptions} onCreateCategory={saveCategory} onSubmit={saveReceivable} onClose={() => { setReceivableModal(false); setEditingReceivable(null); }} />}
      {receivablePayment && <ReceivablePaymentModal data={receivablePayment} setData={setReceivablePayment} categories={categories} onCreateCategory={saveCategory} onSubmit={saveReceivablePayment} onClose={() => setReceivablePayment(null)} />}
      {paymentToCancel && <CancelReceivablePaymentModal data={paymentToCancel} onClose={() => setPaymentToCancel(null)} onConfirm={() => removeReceivablePayment(paymentToCancel.receivable, paymentToCancel.payment)} />}
      {receivableToDelete && <DeleteReceivableModal receivable={receivableToDelete} onClose={() => setReceivableToDelete(null)} onConfirm={() => removeReceivable(receivableToDelete)} />}
      {transactionToDelete && <DeleteTransactionModal transaction={transactionToDelete} onClose={() => setTransactionToDelete(null)} onConfirm={() => removeTransaction(transactionToDelete.id)} />}
    </div>
  );
}


