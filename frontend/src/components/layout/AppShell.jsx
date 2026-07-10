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
import InvoiceTemplatesPage from "../../pages/InvoiceTemplatesPage.jsx";
import InstallmentsPage from "../../pages/InstallmentsPage.jsx";
import SimulationPage from "../../pages/SimulationPage.jsx";
import ReceivablesPage from "../../pages/ReceivablesPage.jsx";
import SettingsPage from "../../pages/SettingsPage.jsx";
import InvoiceModal from "../../modals/InvoiceModal.jsx";
import InstallmentModal from "../../modals/InstallmentModal.jsx";
import InstallmentDetailsModal from "../../modals/InstallmentDetailsModal.jsx";
import ReceivableModal from "../../modals/ReceivableModal.jsx";
import ReceivablePaymentModal from "../../modals/ReceivablePaymentModal.jsx";
import CancelReceivablePaymentModal from "../../modals/CancelReceivablePaymentModal.jsx";
import DeleteReceivableModal from "../../modals/DeleteReceivableModal.jsx";
import { useI18n } from "../../i18n/index.ts";
import { useAuth } from "../../hooks/useAuth.jsx";
import { BRAND_MARK_SRC, CREATE_RECEIVABLE_PERSON_VALUE, MOBILE_MEDIA_QUERY } from "../../app/constants.js";
import { defaultInstallmentForm, defaultInvoiceForm, defaultReceivableForm, isMobileViewport, nextDueDateFromDay, nextMonthDate, normalizeTransactionPayload, shiftMonth, todayIsoDate } from "../../app/helpers.js";
import { addInvoiceItem, createInstallment, createInvoice, createInvoiceTemplate, createReceivable, createReceivablePayment, createReceivablePerson, createRecurrence, createTransaction, deleteInstallment, deleteInstallmentItem, deleteInvoiceItem, deleteInvoiceTemplate, deleteReceivable, deleteReceivablePayment, deleteTransaction, getInstallment, getMonth, getMonthSummary, getMonthsSummary, listInstallments, listInvoices, listInvoiceTemplates, listReceivablePeople, listReceivables, markReceivablePaid, setInvoicePaid, toggleInvoiceTemplate, updateInstallmentItem, updateInvoice, updateInvoiceItem, updateInvoiceTemplate, updateReceivable, updateRecurrence, updateTransaction } from "../../api/api.js";
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
  const [receivables, setReceivables] = useState([]);
  const [receivablePeople, setReceivablePeople] = useState([]);
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

  const monthInputValue = `${year}-${String(month).padStart(2, "0")}`;
  const allowOverdueInvoiceEdits = Boolean(user?.allow_overdue_invoice_edits);
  const showMonthHeader = location.pathname === "/" || location.pathname === "/meses";
  const overlayOpen = drawerOpen || invoiceModal || installmentModal || !!installmentDetails || receivableModal || !!receivablePayment || !!paymentToCancel || !!receivableToDelete;
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
      const [monthPayload, summaryPayload, invoicesPayload, templatesPayload, installmentsPayload, receivablesPayload, peoplePayload, monthCardsPayload, comparisonPayload] = await Promise.all([
        getMonth(year, month),
        getMonthSummary(year, month),
        listInvoices(),
        listInvoiceTemplates(),
        listInstallments(),
        listReceivables(),
        listReceivablePeople(),
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
      setReceivables(receivablesPayload);
      setReceivablePeople(peoplePayload);
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
    const [monthPayload, summaryPayload, monthCardsPayload, comparisonPayload] = await Promise.all([
      getMonth(year, month),
      getMonthSummary(year, month),
      getMonthsSummary(),
      Promise.all(offsets.map(async (offset) => {
        const target = shiftMonth(year, month, offset);
        const data = await getMonthSummary(target.year, target.month);
        return { label: formatMonthLabel(target.year, target.month, language).slice(0, 3), ...data };
      }))
    ]);
    setMonthData(monthPayload);
    setSummary(summaryPayload);
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
            effective_date: payload.recurrenceUpdate.effective_date
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
            active: true
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
      toast.error(details.includes("422") ? "Dados inválidos ao salvar. Revise data e valor." : "Erro ao salvar lançamento");
    }
  };

  const removeTransaction = async (id) => {
    try {
      await deleteTransaction(id);
      toast.success("Item removido");
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
        initial_amount: parseTypedMoneyInput(draft.initial_amount, language)
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

  const openReceivableModal = (receivable = null) => {
    if (receivable) {
      setEditingReceivable(receivable);
      setReceivableForm({
        person_id: String(receivable.person_id || ""),
        person_name: receivable.person_name || "",
        description: receivable.description,
        total_amount: formatMoney(receivable.total_amount, language),
        due_date: receivable.due_date,
        notes: receivable.notes || ""
      });
    } else {
      setEditingReceivable(null);
      setReceivableForm(defaultReceivableForm());
    }
    setReceivableModal(true);
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
        notes: payload.notes?.trim() || null
      };
      if (editingReceivable) await updateReceivable(editingReceivable.id, data);
      else await createReceivable(data);
      setReceivableModal(false);
      setEditingReceivable(null);
      setReceivableForm(defaultReceivableForm());
      toast.success(editingReceivable ? "Conta a receber atualizada" : "Conta a receber criada");
      await refresh();
    } catch {
      toast.error("Erro ao salvar conta a receber");
    }
  };

  const openReceivablePaidModal = (receivable) => {
    setReceivablePayment({
      mode: "paid",
      receivable,
      amount: formatMoney(receivable.remaining_amount, language),
      paid_at: todayIsoDate()
    });
  };

  const openReceivablePaymentModal = (receivable) => {
    setReceivablePayment({
      mode: "partial",
      receivable,
      amount: "",
      paid_at: todayIsoDate()
    });
  };

  const saveReceivablePayment = async (payload) => {
    try {
      if (payload.mode === "paid") {
        await markReceivablePaid(payload.receivable.id, { paid_at: payload.paid_at });
      } else {
        await createReceivablePayment(payload.receivable.id, {
          amount: parseTypedMoneyInput(payload.amount, language),
          paid_at: payload.paid_at
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
              <Route path="/" element={<Dashboard summary={summary} balanceSeries={balanceSeries} comparisons={comparisons} invoices={invoices} monthData={monthData} />} />
              <Route path="/meses" element={<MonthsPage monthData={monthData} summary={summary} monthCards={monthCards} year={year} month={month} setYear={setYear} setMonth={setMonth} openAddForm={openAddForm} setEditing={setEditing} setDrawerOpen={setDrawerOpen} removeTransaction={removeTransaction} />} />
              <Route path="/faturas" element={<InvoicesPage invoices={invoices} allowOverdueInvoiceEdits={allowOverdueInvoiceEdits} addItem={addItem} updateItem={saveItem} updateDueDate={saveInvoiceDueDate} addInstallment={openInstallmentModal} deleteItem={deleteItem} deleteInstallmentItem={removeInstallmentItem} togglePaid={toggleInvoicePaid} openModal={openNewInvoiceModal} openInstallmentModal={() => openInstallmentModal()} openDuplicateInvoiceModal={openDuplicateInvoiceModal} onViewInstallment={showInstallmentDetails} />} />
              <Route path="/modelos-de-fatura" element={<InvoiceTemplatesPage templates={invoiceTemplates} onSave={saveInvoiceTemplate} onToggle={toggleTemplate} onDelete={removeTemplate} />} />
              <Route path="/parcelamentos" element={<InstallmentsPage installments={installments} onNew={() => openInstallmentModal()} onDetails={showInstallmentDetails} />} />
              <Route path="/simulador" element={<SimulationPage invoices={invoices} allowOverdueInvoiceEdits={allowOverdueInvoiceEdits} monthCards={monthCards} onInserted={refresh} />} />
              <Route path="/recebiveis" element={<ReceivablesPage receivables={receivables} onNew={() => openReceivableModal()} onEdit={openReceivableModal} onPaid={openReceivablePaidModal} onPayment={openReceivablePaymentModal} onDelete={(receivable) => receivable.payments?.length ? removeReceivable(receivable) : setReceivableToDelete(receivable)} onDeletePayment={(receivable, payment) => setPaymentToCancel({ receivable, payment })} />} />
              <Route path="/contas-a-receber" element={<Navigate to="/recebiveis" replace />} />
              <Route path="/configuracoes" element={<SettingsPage summary={summary} monthLabel={formatMonthLabel(year, month, language)} monthData={monthData} year={year} month={month} refresh={refresh} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </div>
      </main>

      <TransactionForm open={drawerOpen} initial={editing} date={selectedDate} onClose={() => setDrawerOpen(false)} onSave={saveTransaction} />
      {invoiceModal && <InvoiceModal form={invoiceForm} setForm={setInvoiceForm} templates={invoiceTemplates.filter((template) => template.active)} onCreateTemplate={(payload) => saveInvoiceTemplate(payload)} onSubmit={createNewInvoice} onClose={() => setInvoiceModal(false)} />}
      {installmentModal && <InstallmentModal form={installmentForm} setForm={setInstallmentForm} invoices={invoices} allowOverdueInvoiceEdits={allowOverdueInvoiceEdits} onSubmit={createNewInstallment} onClose={() => setInstallmentModal(false)} />}
      {installmentDetails && <InstallmentDetailsModal purchase={installmentDetails} invoices={invoices} allowOverdueInvoiceEdits={allowOverdueInvoiceEdits} onClose={() => setInstallmentDetails(null)} onDelete={removeInstallment} onSaveItem={saveInstallmentItem} />}
      {receivableModal && <ReceivableModal form={receivableForm} setForm={setReceivableForm} editing={editingReceivable} people={receivablePeople} onSubmit={saveReceivable} onClose={() => { setReceivableModal(false); setEditingReceivable(null); }} />}
      {receivablePayment && <ReceivablePaymentModal data={receivablePayment} setData={setReceivablePayment} onSubmit={saveReceivablePayment} onClose={() => setReceivablePayment(null)} />}
      {paymentToCancel && <CancelReceivablePaymentModal data={paymentToCancel} onClose={() => setPaymentToCancel(null)} onConfirm={() => removeReceivablePayment(paymentToCancel.receivable, paymentToCancel.payment)} />}
      {receivableToDelete && <DeleteReceivableModal receivable={receivableToDelete} onClose={() => setReceivableToDelete(null)} onConfirm={() => removeReceivable(receivableToDelete)} />}
    </div>
  );
}


