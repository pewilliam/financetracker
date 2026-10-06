import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleDollarSign, Info, Loader2, Pencil, Plus, ShoppingBag, Store, Target, Trash2, Trophy, X } from "lucide-react";
import { createPortal } from "react-dom";
import useModalLifecycle from "../hooks/useModalLifecycle.js";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";

import { createDesiredProduct, createProductOffer, deleteDesiredProduct, deleteProductOffer, getDesiredProduct, listDesiredProducts, recordProductPurchase, updateDesiredProduct, updateProductOffer } from "../api/api.js";
import { useI18n } from "../i18n/index.ts";
import FilterSelect from "../components/common/FilterSelect.jsx";
import CategorySelect from "../components/CategorySelect.jsx";
import DateField from "../components/DateField.jsx";
import ProductMedia, { DEFAULT_MEDIA_FRAME } from "../components/ProductMedia.jsx";
import ProductMediaField, { validMediaUrl } from "../components/ProductMediaField.jsx";
import { isMobileViewport } from "../app/helpers.js";
import { formatMoney, formatTypedMoneyForEditing, parseTypedMoneyInput } from "../utils/format.js";
import "./desiredProducts.css";

const STATUSES = { want: "Quero comprar", planning: "Planejando", ready: "Pronto para comprar", bought: "Comprado", abandoned: "Desisti" };
const PRIORITIES = { low: "Baixa", medium: "Média", high: "Alta" };
const PAYMENTS = { cash: "À vista", pix: "PIX", credit: "Cartão de crédito", boleto: "Boleto", other: "Outro" };
const optionsFor = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const moneyInput = (value, locale) => value == null ? "" : formatMoney(value, locale);
const moneyValue = (value, locale) => value ? parseTypedMoneyInput(value, locale).toFixed(2) : null;
const cents = (value) => Math.round(Number(value || 0) * 100);
const dateLabel = (date, locale) => date ? new Date(`${date}T00:00:00`).toLocaleDateString(locale) : "—";

function MoneyField({ label, value, onChange, language, required = false }) {
  return <div className="field-label"><span>{label}</span><input aria-label={label} inputMode="decimal" value={value} required={required} placeholder="R$ 0,00"
    onChange={(event) => onChange(formatTypedMoneyForEditing(event.target.value, language))}
    onBlur={() => value && onChange(moneyInput(parseTypedMoneyInput(value, language), language))} /></div>;
}

function Modal({ title, hint, icon: Icon = ShoppingBag, onClose, children, onSubmit, busy, submitLabel = "Salvar", danger = false }) {
  const formRef = useRef(null);
  const close = () => { if (!busy && !document.querySelector(".category-select-create-layer")) onClose(); };
  useModalLifecycle({ onClose: close, busy });
  useEffect(() => {
    if (!isMobileViewport()) formRef.current?.querySelector("fieldset input, fieldset textarea, footer button")?.focus({ preventScroll: true });
  }, []);
  return createPortal(<div className="modal-layer invoice-template-modal-layer" role="presentation">
    <button type="button" className="modal-backdrop" onClick={close} disabled={busy} aria-label="Fechar" />
    <form ref={formRef} className={`modal-card wallet-modal wallet-editor-modal invoice-template-editor-modal desired-modal ${danger ? "invoice-template-action-modal confirm-modal danger" : ""}`} onSubmit={(event) => { if (busy) event.preventDefault(); else onSubmit(event); }} role={danger ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title}>
      <header className="wallet-transfer-header"><i><Icon size={20} /></i><div><small>PLANEJAMENTO DE COMPRAS</small><h2>{title}</h2>{hint && <p>{hint}</p>}</div><button type="button" className="icon-btn" onClick={close} disabled={busy} aria-label="Fechar"><X size={18} /></button></header>
      <div className={danger ? "confirm-modal-body desired-confirm-body" : "wallet-modal-body"}><fieldset disabled={busy} className={`desired-modal-fields ${danger ? "desired-confirm-fields" : "form-stack"}`}>{children}</fieldset></div>
      <footer className={danger ? "modal-actions" : "wallet-modal-actions"}><button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>Cancelar</button><button type="submit" className={`btn ${danger ? "btn-primary danger-action" : "btn-primary"}`} disabled={busy}>{busy ? <><Loader2 className="spin" size={16} /> {danger ? "Excluindo..." : "Salvando..."}</> : <>{danger && <Trash2 size={16} />}{submitLabel}</>}</button></footer>
    </form>
  </div>, document.body);
}

const validUrl = validMediaUrl;

async function readImage(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Selecione uma imagem PNG, JPEG ou WebP.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Selecione uma imagem de até 10 MB.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.8);
    if (data.length > 4 * 1024 * 1024 / 3) throw new Error("A imagem ainda está grande demais. Escolha outra foto.");
    return data;
  } finally {
    bitmap?.close();
  }
}

function ProductEditor({ product, categories, onCreateCategory, onClose, onSave, language }) {
  const [form, setForm] = useState(() => ({
    name: product?.name || "", category_id: product?.category_id ? String(product.category_id) : product?.category ? "legacy" : "", ean: product?.ean || "", source_url: product?.source_url || "", image_source: product?.image_source || "manual", description: product?.description || "",
    image_data: product?.image_data || null, media_url: product?.media_url || "", media_type: product?.media_type || "image", media_frame: { ...DEFAULT_MEDIA_FRAME, ...product?.media_frame }, priority: product?.priority || "medium",
    target_price: moneyInput(product?.target_price, language), planned_purchase_date: product?.planned_purchase_date || "",
    status: product?.status || "want"
  }));
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const handleImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageBusy(true);
    try { const image = await readImage(file); setForm((current) => ({ ...current, image_data: image, media_url: "", media_type: "image", media_frame: { ...DEFAULT_MEDIA_FRAME }, image_source: "manual" })); } catch (error) { toast.error(error.message); } finally { setImageBusy(false); }
    event.target.value = "";
  };
  const save = async (event) => {
    event.preventDefault();
    const target = moneyValue(form.target_price, language);
    if (form.target_price && (target < 0 || target > 99999999.99)) return toast.error("Confira o preço-alvo.");
    if (form.ean && !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(form.ean)) return toast.error("Informe um EAN/GTIN com 8, 12, 13 ou 14 dígitos.");
    if (!validUrl(form.source_url) || !validUrl(form.media_url)) return toast.error("Informe um link HTTP ou HTTPS válido.");
    const payload = { name: form.name.trim(), ...(form.category_id === "legacy" ? { category: product.category } : { category_id: form.category_id ? Number(form.category_id) : null }),
      ean: form.ean || null, source_url: form.source_url.trim() || null, image_source: form.media_url.trim() ? "url" : "manual", description: form.description.trim() || null,
      image_data: form.media_url.trim() ? null : form.image_data, media_url: form.media_url.trim() || null,
      media_type: form.media_url.trim() ? form.media_type : "image", media_frame: form.media_frame, priority: form.priority, target_price: target, planned_purchase_date: form.planned_purchase_date || null,
      ...(form.status === "bought" ? {} : { status: form.status }) };
    if (!payload.name) return toast.error("Informe o nome do produto.");
    setBusy(true);
    try { await onSave(payload); onClose(); } catch (error) { toast.error(error.message || "Não foi possível salvar o produto."); } finally { setBusy(false); }
  };
  return <Modal title={product ? "Editar produto" : "Novo produto desejado"} hint="Defina seu objetivo e organize a próxima compra." onClose={onClose} onSubmit={save} busy={busy || imageBusy} submitLabel={product ? "Salvar alterações" : "Criar produto"}>
    <div className="field-label"><span>Link do produto</span><input aria-label="Link do produto" type="url" maxLength={2048} value={form.source_url} onChange={(event) => set("source_url", event.target.value)} placeholder="https://loja.com/produto" /></div>
    <div className="field-label"><span>Nome do produto *</span><input aria-label="Nome do produto *" required maxLength={255} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Notebook Dell Inspiron 15" /></div>
    <div className="field-label"><span>Categoria</span><CategorySelect categories={product?.category && !product.category_id ? [...categories, { id: "legacy", name: product.category, color: "#64748B" }] : categories}
      value={form.category_id} multiple={false} ariaLabel="Categoria" disabled={busy || imageBusy} onCreate={onCreateCategory}
      onChange={(value) => set("category_id", Array.isArray(value) ? value[0] || "" : value)} /></div>
    <div className="field-label"><span>EAN/GTIN</span><input aria-label="EAN/GTIN" inputMode="numeric" maxLength={14} value={form.ean} onChange={(event) => set("ean", event.target.value)} placeholder="Opcional · código de barras" /></div>
    <ProductMediaField value={form} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} onUpload={handleImage} busy={imageBusy} disabled={busy || imageBusy} />
    <div className="field-label"><span>Observações</span><textarea aria-label="Observações" maxLength={2000} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
    <div className="desired-form-row"><div className="field-label"><span>Prioridade</span><FilterSelect ariaLabel="Prioridade" value={form.priority} options={optionsFor(PRIORITIES)} disabled={busy || imageBusy} onChange={(value) => set("priority", value)} /></div>
      <div className="field-label"><span>Status</span><FilterSelect ariaLabel="Status" value={form.status} options={optionsFor(STATUSES).filter((option) => option.value !== "bought" || product?.status === "bought")} disabled={busy || imageBusy} onChange={(value) => set("status", value)} /></div></div>
    <div className="desired-form-row"><MoneyField label="Preço-alvo" value={form.target_price} onChange={(v) => set("target_price", v)} language={language} />
      <div className="field-label"><span>Previsão de compra</span><DateField clearable ariaLabel="Previsão de compra" value={form.planned_purchase_date} disabled={busy || imageBusy} onChange={(value) => set("planned_purchase_date", value)} /></div></div>
    {form.status === "bought" && <small>Para alterar os dados da compra, use “Editar compra” nos detalhes.</small>}
  </Modal>;
}

function OfferEditor({ offer, product, onClose, onSave, language }) {
  const [form, setForm] = useState(() => ({ store: offer?.store || "", url: offer?.url || product?.source_url || "", price: moneyInput(offer?.price, language),
    shipping: moneyInput(offer?.shipping, language), payment_method: offer?.payment_method || "cash",
    installment_count: offer?.installment_count || 1, installment_amount: moneyInput(offer?.installment_amount, language),
    notes: offer?.notes || "", recorded_at: offer?.recorded_at || today() }));
  const [manualInstallment, setManualInstallment] = useState(offer?.installment_amount != null);
  const [busy, setBusy] = useState(false);
  const set = (field, value) => {
    if (field === "price" || field === "installment_count") setManualInstallment(false);
    setForm((current) => ({ ...current, [field]: value }));
  };
  const price = moneyValue(form.price, language);
  const count = Number(form.installment_count);
  const calculated = price && count > 0 ? Math.round(cents(price) / count) / 100 : null;
  const save = async (event) => {
    event.preventDefault();
    if (!form.store.trim() || !price || price <= 0 || price > 99999999.99) return toast.error("Informe loja e preço válidos.");
    if (form.url.trim()) {
      try {
        const link = new URL(form.url.trim());
        if (!["http:", "https:"].includes(link.protocol) || link.username || link.password) throw new Error();
      } catch { return toast.error("Informe um link HTTP ou HTTPS válido."); }
    }
    if (!form.recorded_at) return toast.error("Informe a data do preço.");
    const shipping = moneyValue(form.shipping, language);
    if (shipping != null && (shipping < 0 || shipping > 99999999.99)) return toast.error("Confira o frete.");
    if (cents(price) + cents(shipping) > 9999999999) return toast.error("O custo total excede o limite permitido.");
    if (form.payment_method === "credit" && (!Number.isInteger(count) || count < 1 || count > 60)) return toast.error("Informe entre 1 e 60 parcelas.");
    const installment = form.payment_method === "credit" && manualInstallment ? moneyValue(form.installment_amount, language) : null;
    if (manualInstallment && form.payment_method === "credit" && (!installment || installment <= 0 || installment > 99999999.99)) return toast.error("Informe o valor da parcela.");
    const payload = { store: form.store.trim(), url: form.url.trim() || null, price, shipping,
      payment_method: form.payment_method, installment_count: form.payment_method === "credit" ? count : null,
      installment_amount: installment, notes: form.notes.trim() || null, recorded_at: form.recorded_at };
    setBusy(true);
    try { await onSave(payload); onClose(); } catch (error) { toast.error(error.message || "Não foi possível salvar a oferta."); } finally { setBusy(false); }
  };
  return <Modal title={offer ? "Editar oferta" : "Adicionar oferta"} icon={Target} hint="Salve o link, o preço e as condições desta loja." onClose={onClose} onSubmit={save} busy={busy} submitLabel={offer ? "Salvar oferta" : "Adicionar oferta"}>
    <div className="field-label"><span>Loja *</span><input aria-label="Loja *" required maxLength={150} value={form.store} onChange={(e) => set("store", e.target.value)} placeholder="Ex.: Amazon" /></div>
    <div className="field-label"><span>Link da oferta</span><input aria-label="Link da oferta" type="url" maxLength={2048} value={form.url} onChange={(event) => set("url", event.target.value)} placeholder="https://loja.com/produto" /></div>
    <div className="desired-form-row"><MoneyField label="Preço *" value={form.price} onChange={(v) => set("price", v)} language={language} required />
      <MoneyField label="Frete" value={form.shipping} onChange={(v) => set("shipping", v)} language={language} /></div>
    <div className="desired-form-row"><div className="field-label"><span>Pagamento</span><FilterSelect ariaLabel="Pagamento" value={form.payment_method} options={optionsFor(PAYMENTS)} disabled={busy} onChange={(value) => set("payment_method", value)} /></div>
      <div className="field-label"><span>Data do preço *</span><DateField clearable ariaLabel="Data do preço" value={form.recorded_at} disabled={busy} onChange={(value) => set("recorded_at", value)} /></div></div>
    {form.payment_method === "credit" && <><div className="desired-form-row"><div className="field-label"><span>Quantidade de parcelas</span><input aria-label="Quantidade de parcelas" type="number" min="1" max="60" required value={form.installment_count} onChange={(e) => set("installment_count", e.target.value)} /></div>
      <MoneyField label="Valor da parcela" value={manualInstallment ? form.installment_amount : moneyInput(calculated, language)} onChange={(v) => { setManualInstallment(true); set("installment_amount", v); }} language={language} /></div>
      <p className="desired-hint">Calculado: {calculated != null ? formatMoney(calculated, language) : "—"}/mês. Ajuste a parcela se houver juros. Para comparar, informe no preço o valor total da oferta nessa forma de pagamento.</p></>}
    <div className="field-label"><span>Observações</span><textarea aria-label="Observações" rows={3} maxLength={2000} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
  </Modal>;
}

function PurchaseEditor({ product, onClose, onSave, language }) {
  const initial = product.offers.find((offer) => offer.id === (product.chosen_offer_id || product.best_offer_id)) || product.offers[0];
  const [form, setForm] = useState({ chosen_offer_id: initial?.id || "", paid_price: moneyInput(product.paid_price ?? initial?.total_cost, language),
    purchase_date: product.purchase_date || today(), payment_method: product.purchase_payment_method || initial?.payment_method || "cash",
    installment_count: product.purchase_installment_count || initial?.installment_count || 1,
    installment_amount: moneyInput(product.purchase_installment_amount ?? initial?.installment_amount, language) });
  const [busy, setBusy] = useState(false);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const save = async (event) => {
    event.preventDefault();
    if (!form.purchase_date) return toast.error("Informe a data da compra.");
    const paid_price = moneyValue(form.paid_price, language);
    const installment_count = form.payment_method === "credit" ? Number(form.installment_count) : null;
    const installment_amount = form.payment_method === "credit" ? moneyValue(form.installment_amount, language) : null;
    if (!paid_price || paid_price <= 0 || paid_price > 99999999.99) return toast.error("Informe o preço final pago.");
    if (form.payment_method === "credit" && installment_amount != null && (installment_amount <= 0 || installment_amount > 99999999.99)) return toast.error("Confira o valor da parcela.");
    if (form.payment_method === "credit" && (!Number.isInteger(installment_count) || installment_count < 1 || installment_count > 60)) return toast.error("Confira as parcelas.");
    setBusy(true);
    try { await onSave({ chosen_offer_id: Number(form.chosen_offer_id), paid_price, purchase_date: form.purchase_date,
      payment_method: form.payment_method, installment_count, installment_amount }); onClose(); }
    catch (error) { toast.error(error.message || "Não foi possível registrar a compra."); } finally { setBusy(false); }
  };
  return <Modal title={product.status === "bought" ? "Editar compra" : "Marcar como comprado"} icon={Check} hint="Confirme a oferta escolhida e os dados da compra." onClose={onClose} onSubmit={save} busy={busy} submitLabel="Salvar compra">
    <div className="field-label"><span>Oferta escolhida *</span><FilterSelect ariaLabel="Oferta escolhida" value={form.chosen_offer_id} disabled={busy}
      options={product.offers.map((offer) => ({ value: String(offer.id), label: `${offer.store} · ${formatMoney(offer.total_cost, language)}` }))}
      onChange={(value) => { const offer = product.offers.find((item) => item.id === Number(value)); setForm((current) => ({ ...current, chosen_offer_id: offer.id,
        paid_price: moneyInput(offer.total_cost, language), payment_method: offer.payment_method,
        installment_count: offer.installment_count || 1, installment_amount: moneyInput(offer.installment_amount, language) })); }} /></div>
    <div className="desired-form-row"><MoneyField label="Preço final pago *" value={form.paid_price} onChange={(v) => set("paid_price", v)} language={language} required />
      <div className="field-label"><span>Data da compra *</span><DateField clearable ariaLabel="Data da compra" value={form.purchase_date} disabled={busy} onChange={(value) => set("purchase_date", value)} /></div></div>
    <div className="field-label"><span>Forma de pagamento</span><FilterSelect ariaLabel="Forma de pagamento" value={form.payment_method} options={optionsFor(PAYMENTS)} disabled={busy} onChange={(value) => set("payment_method", value)} /></div>
    {form.payment_method === "credit" && <div className="desired-form-row"><div className="field-label"><span>Parcelas *</span><input aria-label="Parcelas *" type="number" min="1" max="60" required value={form.installment_count} onChange={(e) => set("installment_count", e.target.value)} /></div>
      <MoneyField label="Valor da parcela" value={form.installment_amount} onChange={(v) => set("installment_amount", v)} language={language} /></div>}
  </Modal>;
}

function TargetNote({ product, language }) {
  if (product.target_price == null || product.best_price == null) return null;
  const gap = (cents(product.best_price) - cents(product.target_price)) / 100;
  return <span className={`desired-target-note ${gap <= 0 ? "reached" : ""}`}><Target size={16} />
    {gap <= 0 ? "Seu preço-alvo foi atingido" : `${formatMoney(gap, language)} acima do seu preço desejado`}</span>;
}

function ProductCard({ product, language }) {
  return <article className="card desired-product-card">
    <div className="desired-cover">
      <ProductMedia product={product} alt={product.name} />
      <span className={`desired-card-status status-${product.status}`}>{STATUSES[product.status]}</span>
    </div>
    <div className="desired-card-body">
      <div className="desired-card-title">
        <h2>{product.name}</h2>
        {product.category && <p>{product.category}</p>}
      </div>
      <div className="desired-card-pricing">
        <div className="desired-card-price"><small>Melhor oferta</small>
          {product.best_price != null ? <strong>{formatMoney(product.best_price, language)}</strong> : <span>Ainda sem ofertas</span>}
        </div>
        <span className="desired-card-offers"><ShoppingBag size={14} />{product.offer_count} {product.offer_count === 1 ? "oferta" : "ofertas"}</span>
      </div>
      {product.target_price != null && <div className="desired-card-target">
        <div><span>Preço-alvo</span><strong>{formatMoney(product.target_price, language)}</strong></div>
        <TargetNote product={product} language={language} />
      </div>}
    </div>
    <footer className="desired-card-footer">
      <span className={`desired-card-priority priority-${product.priority}`}><i aria-hidden="true" />Prioridade {PRIORITIES[product.priority]}</span>
      <Link className="desired-card-open desired-card-link" to={`/produtos-desejados/${product.id}`} aria-label={`Ver produto ${product.name}`}>Ver detalhes <ArrowUpRight size={16} /></Link>
    </footer>
  </article>;
}

function OfferCard({ offer, bestOfferId, language, onEdit, onDelete }) {
  const priceHistory = offer.store_price_history || offer.price_history || [];
  return <article className={`card desired-offer ${offer.id === bestOfferId ? "best" : ""} ${offer.is_expired ? "expired" : ""}`}>
    <div className="desired-offer-top"><div className="desired-offer-store"><span className="desired-store-icon"><Store size={18} /></span><div>{offer.id === bestOfferId && <span className="desired-best"><Trophy size={13} /> MELHOR OFERTA</span>}{offer.is_expired && <span className="desired-expired"><CalendarDays size={13} /> PREÇO VENCIDO</span>}<h3>{offer.store}</h3><small>Preço registrado em {dateLabel(offer.recorded_at, language)}</small></div></div>
      <div className="desired-offer-price"><small>Custo total</small><strong>{formatMoney(offer.total_cost, language)}</strong></div></div>
    <div className="desired-offer-details"><span><small>Produto</small><strong>{formatMoney(offer.price, language)}</strong></span><span><small>Frete</small><strong>{offer.shipping != null ? formatMoney(offer.shipping, language) : "Não informado"}</strong></span><span><small>Pagamento</small><strong>{PAYMENTS[offer.payment_method]}{offer.payment_method === "credit" ? ` · ${offer.installment_count}x de ${formatMoney(offer.installment_amount, language)}` : ""}</strong></span></div>
    {offer.notes && <p className="desired-offer-notes">{offer.notes}</p>}
    <div className="desired-offer-actions">{offer.url && <a className="btn btn-ghost compact" href={offer.url} target="_blank" rel="noopener noreferrer">Ver na loja <ArrowUpRight size={15} /></a>}
      <button className="btn btn-ghost compact" onClick={() => onEdit(offer)}><Pencil size={15} /> Editar</button><button className="btn btn-ghost compact desired-delete-action" onClick={() => onDelete(offer)}><Trash2 size={15} /> Excluir</button></div>
    <details className="desired-history"><summary>Histórico de preços da loja ({priceHistory.length})</summary><ul>{priceHistory.map((row) => <li key={row.id}><span>{dateLabel(row.recorded_at, language)}</span><strong>{formatMoney(row.price, language)}</strong><small>Custo total {formatMoney(row.total_cost, language)}</small></li>)}</ul></details>
  </article>;
}

export default function DesiredProductsPage({ categories: availableCategories = [], onCreateCategory, onOverlayChange }) {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { language } = useI18n();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [offersExpanded, setOffersExpanded] = useState(false);
  const [expiredOffersExpanded, setExpiredOffersExpanded] = useState(false);
  useEffect(() => { onOverlayChange?.(Boolean(modal)); return () => onOverlayChange?.(false); }, [modal, onOverlayChange]);
  const loadToken = useRef(0);
  const load = useCallback(async () => {
    const token = ++loadToken.current;
    setLoading(true); setError(null);
    try {
      const data = productId ? [await getDesiredProduct(productId)] : await listDesiredProducts();
      if (token === loadToken.current) setProducts(data);
    } catch (caught) {
      if (token === loadToken.current) setError(caught.message || "Não foi possível carregar os produtos.");
    } finally { if (token === loadToken.current) setLoading(false); }
  }, [productId]);
  useEffect(() => { load(); return () => { loadToken.current++; }; }, [load]);
  const selected = products.find((item) => String(item.id) === productId);
  useEffect(() => { setOffersExpanded(false); setExpiredOffersExpanded(false); }, [selected?.id]);
  useEffect(() => { if (!offersExpanded) setExpiredOffersExpanded(false); }, [offersExpanded]);
  const currentOffers = selected?.offers.filter((offer) => !offer.is_expired).sort((a, b) => a.total_cost - b.total_cost) || [];
  const expiredOffers = selected?.offers.filter((offer) => offer.is_expired).sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at))) || [];
  const categories = useMemo(() => [...new Set(products.map((item) => item.category).filter(Boolean))].sort(), [products]);
  const filtered = products.filter((product) => (statusFilter === "all" || product.status === statusFilter)
    && (categoryFilter === "all" || product.category === categoryFilter)
    && (priorityFilter === "all" || product.priority === priorityFilter));
  const upsert = (product) => setProducts((current) => [product, ...current.filter((item) => item.id !== product.id)]);
  const saveProduct = async (payload) => {
    const saved = modal?.product ? await updateDesiredProduct(modal.product.id, payload) : await createDesiredProduct(payload);
    upsert(saved); toast.success(modal?.product ? "Produto atualizado" : "Produto criado");
    if (!modal?.product) navigate(`/produtos-desejados/${saved.id}`);
  };
  const saveOffer = async (payload) => {
    upsert(modal.offer ? await updateProductOffer(selected.id, modal.offer.id, payload) : await createProductOffer(selected.id, payload));
    toast.success(modal.offer ? "Oferta atualizada" : "Oferta adicionada");
  };
  const remove = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      if (modal.offer) { await deleteProductOffer(selected.id, modal.offer.id); setModal(null);
        await load(); toast.success("Oferta excluída"); }
      else { await deleteDesiredProduct(selected.id); setProducts((current) => current.filter((item) => item.id !== selected.id)); navigate("/produtos-desejados"); toast.success("Produto excluído"); }
      setModal(null);
    } catch (caught) { toast.error(caught.message || "Não foi possível excluir."); } finally { setBusy(false); }
  };
  return <section className="desired-page">
    {productId && <button className="btn btn-ghost compact desired-back" onClick={() => navigate("/produtos-desejados")}><ArrowLeft size={16} /> Todos os produtos</button>}
    <header className="page-header desired-header"><div><p className="eyebrow">PLANEJAMENTO DE COMPRAS</p><h1>{selected?.name || "Produtos desejados"}</h1>
      <p>{selected ? "Compare as ofertas e escolha quando vale a pena comprar." : "Guarde ideias, compare ofertas e acompanhe seu preço-alvo."}</p></div>
      <button className="btn btn-primary" disabled={loading || Boolean(error) || Boolean(productId && !selected)} onClick={() => setModal(selected ? { type: "offer" } : { type: "product" })}><Plus size={17} /> {selected ? "Adicionar oferta" : "Novo produto"}</button></header>
    {loading && <div className="card desired-empty">Carregando produtos...</div>}
    {error && <div className="card desired-empty"><p>{error}</p><button className="btn btn-ghost" onClick={load}>Tentar novamente</button></div>}
    {!loading && !error && productId && !selected && <div className="card desired-empty">Produto não encontrado.</div>}
    {!loading && !error && !productId && <>
      <div className="desired-filters"><div className="field-label"><span>Status</span><FilterSelect ariaLabel="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: "all", label: "Todos" }, ...optionsFor(STATUSES)]} /></div>
        <div className="field-label"><span>Categoria</span><FilterSelect ariaLabel="Categoria" value={categoryFilter} onChange={setCategoryFilter} searchable options={[{ value: "all", label: "Todas" }, ...categories.map((category) => ({ value: category, label: category }))]} /></div>
        <div className="field-label"><span>Prioridade</span><FilterSelect ariaLabel="Prioridade" value={priorityFilter} onChange={setPriorityFilter} options={[{ value: "all", label: "Todas" }, ...optionsFor(PRIORITIES)]} /></div></div>
      {filtered.length === 0 ? <div className="card desired-empty"><ShoppingBag size={34} /><h2>{products.length ? "Nenhum produto encontrado" : "Sua lista começa aqui"}</h2><p>{products.length ? "Altere os filtros para encontrar outro produto." : "Cadastre um produto e adicione quantas ofertas quiser."}</p></div>
        : <div className="desired-grid">{filtered.map((product) => <ProductCard key={product.id} product={product} language={language} />)}</div>}
    </>}
    {!loading && !error && selected && <div className="desired-detail-view">
      <div className="desired-detail-grid">
        <article className="card desired-product-summary">
          <div className="desired-detail-image">
            <ProductMedia product={selected} alt={selected.name} />
            <div className="desired-image-tags"><span className={`status-${selected.status}`}>{STATUSES[selected.status]}</span><span>Prioridade {PRIORITIES[selected.priority]}</span></div>
          </div>
          <div className="desired-product-body">
            {(selected.category || selected.description) && <div className="desired-product-copy">
              {selected.category && <span className="desired-category">{selected.category}</span>}
              {selected.description && <p className="desired-description">{selected.description}</p>}
            </div>}
            {(selected.target_price != null || selected.planned_purchase_date) && <div className="desired-product-facts">
              {selected.target_price != null && <div><span className="desired-fact-icon"><Target size={17} /></span><span><small>Preço-alvo</small><strong>{formatMoney(selected.target_price, language)}</strong></span></div>}
              {selected.planned_purchase_date && <div><span className="desired-fact-icon"><CalendarDays size={17} /></span><span><small>Compra prevista</small><strong>{dateLabel(selected.planned_purchase_date, language)}</strong></span></div>}
            </div>}
            <TargetNote product={selected} language={language} />
            {(selected.source_url || selected.ean) && <div className="desired-product-links">
              {selected.source_url && <a className="btn btn-ghost compact" href={selected.source_url} target="_blank" rel="noopener noreferrer">Ver produto na loja <ArrowUpRight size={15} /></a>}
              {selected.ean && <small>EAN/GTIN {selected.ean}</small>}
            </div>}
            <div className="desired-actions"><button className="btn btn-ghost compact" onClick={() => setModal({ type: "product", product: selected })}><Pencil size={15} /> Editar</button>
              {selected.status !== "bought" && selected.offers.length > 0 && <button className="btn btn-primary compact" onClick={() => setModal({ type: "purchase" })}><Check size={15} /> Marcar como comprado</button>}
              <button className="btn btn-ghost compact desired-delete-action" onClick={() => setModal({ type: "delete-product" })}><Trash2 size={15} /> Excluir</button></div>
          </div>
        </article>

        <aside className="card desired-comparison">
          <header className="desired-panel-heading"><span><CircleDollarSign size={20} /></span><div><p>RESUMO DE PREÇOS</p><h2>Comparação de ofertas</h2></div></header>
          {selected.best_price == null ? <div className="desired-comparison-empty"><span><Store size={24} /></span><div><strong>{selected.offers.length ? "Nenhuma oferta atual" : "Você ainda não adicionou ofertas"}</strong><p>{selected.offers.length ? "As ofertas cadastradas têm mais de 30 dias. Atualize os preços para comparar novamente." : "Cadastre preços de lojas diferentes para descobrir a melhor opção."}</p></div><button className="btn btn-primary compact" onClick={() => setModal({ type: "offer" })}><Plus size={15} /> {selected.offers.length ? "Adicionar preço atual" : "Adicionar primeira oferta"}</button></div>
            : <><div className="desired-best-price"><small>Melhor custo encontrado</small><strong>{formatMoney(selected.best_price, language)}</strong><span>preço + frete</span></div>
              <div className="desired-metrics"><div><small>Maior custo</small><strong>{formatMoney(selected.highest_price, language)}</strong></div><div><small>Economia possível</small><strong>{formatMoney(selected.savings || 0, language)}</strong></div></div>
              {selected.savings > 0 && <p className="desired-saving"><Trophy size={16} /> Você economiza {formatMoney(selected.savings, language)} escolhendo a melhor oferta.</p>}</>}
          <p className="desired-hint"><Info size={14} /> O custo total considera o preço do produto e o frete. Compare condições de pagamento separadamente.</p>
          {selected.status === "bought" && <div className="desired-purchase"><span className="desired-purchase-icon"><Check size={17} /></span><div><strong>Compra registrada</strong><span>{selected.purchase_store || "Oferta removida"} · {formatMoney(selected.paid_price, language)} · {dateLabel(selected.purchase_date, language)}</span>
            <small>{PAYMENTS[selected.purchase_payment_method]}{selected.purchase_installment_count ? ` · ${selected.purchase_installment_count}x de ${formatMoney(selected.purchase_installment_amount, language)}` : ""}</small></div>
            {selected.offers.length > 0 && <button className="btn btn-ghost compact" onClick={() => setModal({ type: "purchase" })}>Editar compra</button>}</div>}
        </aside>
      </div>

      <section className={`card desired-offers-section ${offersExpanded ? "expanded" : ""}`}>
        <header className="desired-offer-head">
          <button type="button" className="desired-offers-toggle" aria-expanded={offersExpanded} aria-controls="desired-offers-panel" aria-label={`${offersExpanded ? "Ocultar" : "Ver"} ofertas (${selected.offer_count})`} onClick={() => setOffersExpanded((current) => !current)}><div><p className="eyebrow">PESQUISA DE PREÇOS</p><h2>Ofertas ({selected.offer_count})</h2><p>Compare valores, frete e formas de pagamento em um só lugar.</p></div><ChevronDown className="desired-offers-chevron" size={20} /></button>
          <button className="btn btn-ghost" onClick={() => setModal({ type: "offer" })}><Plus size={16} /> Adicionar oferta</button>
        </header>
        <div id="desired-offers-panel" className="desired-offers-panel" hidden={!offersExpanded}>
          {selected.offers.length === 0 ? <div className="desired-empty desired-offers-empty"><span><ShoppingBag size={26} /></span><h3>Nenhuma oferta cadastrada</h3><p>Adicione a primeira loja e comece a acompanhar os preços.</p><button className="btn btn-primary compact" onClick={() => setModal({ type: "offer" })}><Plus size={15} /> Adicionar oferta</button></div>
            : <div className="desired-offer-groups">
              {currentOffers.length > 0 ? <section className="desired-current-offers" aria-label="Ofertas atuais"><header><strong>Ofertas atuais</strong><small>{currentOffers.length} {currentOffers.length === 1 ? "preço válido" : "preços válidos"}</small></header><div className="desired-offers">{currentOffers.map((offer) => <OfferCard key={offer.id} offer={offer} bestOfferId={selected.best_offer_id} language={language} onEdit={(item) => setModal({ type: "offer", offer: item })} onDelete={(item) => setModal({ type: "delete-offer", offer: item })} />)}</div></section>
                : <div className="desired-current-offers-empty"><Info size={16} /><span>Nenhuma oferta atual para comparar.</span></div>}
              {expiredOffers.length > 0 && <section className={`desired-expired-offers ${expiredOffersExpanded ? "expanded" : ""}`}>
                <button type="button" className="desired-expired-toggle" aria-expanded={expiredOffersExpanded} aria-controls="desired-expired-offers-panel" onClick={() => setExpiredOffersExpanded((current) => !current)}><span><CalendarDays size={17} /><span><strong>Ofertas vencidas ({expiredOffers.length})</strong><small>Preços com mais de 30 dias não entram na comparação.</small></span></span><ChevronDown size={18} /></button>
                <div id="desired-expired-offers-panel" className="desired-expired-panel" hidden={!expiredOffersExpanded}><div className="desired-offers">{expiredOffers.map((offer) => <OfferCard key={offer.id} offer={offer} bestOfferId={selected.best_offer_id} language={language} onEdit={(item) => setModal({ type: "offer", offer: item })} onDelete={(item) => setModal({ type: "delete-offer", offer: item })} />)}</div></div>
              </section>}
            </div>}
        </div>
      </section>
    </div>}
    {modal?.type === "product" && <ProductEditor key={modal.product?.id || "new"} product={modal.product} categories={availableCategories} onCreateCategory={onCreateCategory} onClose={() => setModal(null)} onSave={saveProduct} language={language} />}
    {modal?.type === "offer" && selected && <OfferEditor key={modal.offer?.id || "new"} offer={modal.offer} product={selected} onClose={() => setModal(null)} onSave={saveOffer} language={language} />}
    {modal?.type === "purchase" && selected && <PurchaseEditor product={selected} onClose={() => setModal(null)} onSave={async (payload) => { upsert(await recordProductPurchase(selected.id, payload)); toast.success("Compra registrada"); }} language={language} />}
    {modal?.type?.startsWith("delete-") && <Modal title={modal.offer ? "Excluir oferta?" : "Excluir produto?"} icon={Trash2} onClose={() => setModal(null)} onSubmit={remove} busy={busy} submitLabel="Excluir" danger><p>{modal.offer ? "A oferta será removida da comparação. O histórico e os dados de compras registradas serão preservados." : "O produto, suas ofertas e seus históricos serão excluídos."}</p></Modal>}
  </section>;
}
