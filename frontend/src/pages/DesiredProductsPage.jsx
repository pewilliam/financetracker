import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Info, Loader2, Pencil, Plus, Search, ShoppingBag, Star, Store, Target, Trash2, Trophy, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useModalLifecycle from "../hooks/useModalLifecycle.js";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";

import { createDesiredProduct, createProductOffer, deleteDesiredProduct, deleteProductOffer, getDesiredProduct, listDesiredProducts, recordProductPurchase, resolveProductOffer, searchProductOffers, updateDesiredProduct, updateProductOffer } from "../api/api.js";
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
const OFFERS_PER_PAGE = 10;
const LOAD_RETRY_DELAYS = [1200, 2500, 4500, 7000, 9000];
const optionsFor = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const moneyInput = (value, locale) => value == null ? "" : formatMoney(value, locale);
const moneyValue = (value, locale) => value ? parseTypedMoneyInput(value, locale).toFixed(2) : null;
const cents = (value) => Math.round(Number(value || 0) * 100);
const dateLabel = (date, locale) => date ? new Date(`${date}T00:00:00`).toLocaleDateString(locale) : "—";
const compactMoney = (value, locale) => new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(value);

function isTransientLoadError(error) {
  if (error?.name === "AbortError") return false;
  if (error?.status == null) return true;
  return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}

function waitForRetry(delay, signal) {
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timer);
      const error = new Error("Request aborted");
      error.name = "AbortError";
      reject(error);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delay);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function buildPriceTrend(offers = []) {
  const seen = new Set();
  const byDate = new Map();
  offers.forEach((offer) => {
    const history = offer.store_price_history?.length ? offer.store_price_history : offer.price_history || [];
    history.forEach((row) => {
      const key = row.id ?? `${offer.store}|${row.recorded_at}|${row.price}|${row.total_cost}`;
      if (seen.has(key)) return;
      seen.add(key);
      const value = Number(row.total_cost ?? row.price);
      if (!row.recorded_at || !Number.isFinite(value)) return;
      const existing = byDate.get(row.recorded_at);
      if (!existing || value < existing.value) byDate.set(row.recorded_at, { date: row.recorded_at, value, store: offer.store });
    });
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function priceChartDomain(points, targetPrice) {
  const values = points.map((point) => point.value);
  const target = Number(targetPrice);
  if (Number.isFinite(target)) values.push(target);
  if (!values.length) return [0, 100];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum;
  const padding = span > 0 ? span * .14 : Math.max(maximum * .08, 10);
  return [Math.max(0, minimum - padding), maximum + padding];
}

function PriceTrendTooltip({ active, payload, language }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div className="desired-price-chart-tooltip"><strong>{dateLabel(point.date, language)}</strong><span>Menor preço <b>{formatMoney(point.value, language)}</b></span><small>{point.store}</small></div>;
}

function PriceTrendChart({ offers, targetPrice, language }) {
  const data = useMemo(() => buildPriceTrend(offers), [offers]);
  const domain = useMemo(() => priceChartDomain(data, targetPrice), [data, targetPrice]);
  const lowest = data.length ? Math.min(...data.map((point) => point.value)) : null;
  const numericTarget = Number(targetPrice);
  return <section className="desired-price-chart" aria-labelledby="desired-price-chart-title">
    <header><div><p>HISTÓRICO DE PREÇOS</p><h3 id="desired-price-chart-title">Evolução do menor preço</h3></div><span aria-hidden="true"><Activity size={18} /></span></header>
    {data.length ? <>
      <div className="desired-price-chart-canvas" aria-label="Gráfico da evolução do menor preço registrado">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
            <defs><linearGradient id="desiredPriceFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={.24} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={.02} /></linearGradient></defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(value) => dateLabel(value, language).slice(0, 5)} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis domain={domain} tickFormatter={(value) => compactMoney(value, language)} tickLine={false} axisLine={false} tickMargin={7} width={75} />
            <Tooltip content={<PriceTrendTooltip language={language} />} />
            {Number.isFinite(numericTarget) && <ReferenceLine y={numericTarget} stroke="#d18a00" strokeDasharray="5 4" label={{ value: "Preço-alvo", position: "insideBottomRight", fill: "#d18a00", fontSize: 12 }} />}
            <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} fill="url(#desiredPriceFill)" dot={data.length <= 4 ? { r: 4, fill: "var(--card)", strokeWidth: 3 } : false} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <footer><span>{data.length} {data.length === 1 ? "data registrada" : "datas registradas"}</span><strong>Menor histórico {formatMoney(lowest, language)}</strong></footer>
    </> : <div className="desired-price-chart-empty"><Activity size={24} /><strong>Histórico ainda indisponível</strong><span>Novos preços aparecerão aqui.</span></div>}
  </section>;
}

function MoneyField({ label, value, onChange, language, required = false }) {
  return <div className="field-label"><span>{label}</span><input aria-label={label} inputMode="decimal" value={value} required={required} placeholder="R$ 0,00"
    onChange={(event) => onChange(formatTypedMoneyForEditing(event.target.value, language))}
    onBlur={() => value && onChange(moneyInput(parseTypedMoneyInput(value, language), language))} /></div>;
}

function Modal({ title, hint, icon: Icon = ShoppingBag, onClose, children, onSubmit, busy, submitLabel = "Salvar", busyLabel = "Salvando...", danger = false, className = "" }) {
  const formRef = useRef(null);
  const close = () => { if (!busy && !document.querySelector(".category-select-create-layer")) onClose(); };
  useModalLifecycle({ onClose: close, busy });
  useEffect(() => {
    if (!isMobileViewport()) formRef.current?.querySelector("fieldset input, fieldset textarea, footer button")?.focus({ preventScroll: true });
  }, []);
  return createPortal(<div className="modal-layer invoice-template-modal-layer" role="presentation">
    <button type="button" className="modal-backdrop" onClick={close} disabled={busy} aria-label="Fechar" />
    <form ref={formRef} className={`modal-card wallet-modal wallet-editor-modal invoice-template-editor-modal desired-modal ${danger ? "invoice-template-action-modal confirm-modal danger" : ""} ${className}`} onSubmit={(event) => { if (busy) event.preventDefault(); else onSubmit(event); }} role={danger ? "alertdialog" : "dialog"} aria-modal="true" aria-label={title}>
      <header className="wallet-transfer-header"><i><Icon size={20} /></i><div><small>PLANEJAMENTO DE COMPRAS</small><h2>{title}</h2>{hint && <p>{hint}</p>}</div><button type="button" className="icon-btn" onClick={close} disabled={busy} aria-label="Fechar"><X size={18} /></button></header>
      <div className={danger ? "confirm-modal-body desired-confirm-body" : "wallet-modal-body"}><fieldset disabled={busy} className={`desired-modal-fields ${danger ? "desired-confirm-fields" : "form-stack"}`}>{children}</fieldset></div>
      <footer className={danger ? "modal-actions" : "wallet-modal-actions"}><button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>Cancelar</button><button type="submit" className={`btn ${danger ? "btn-primary danger-action" : "btn-primary"}`} disabled={busy}>{busy ? <><Loader2 className="spin" size={16} /> {danger ? "Excluindo..." : busyLabel}</> : <>{danger && <Trash2 size={16} />}{submitLabel}</>}</button></footer>
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
  const editing = Boolean(offer?.id);
  const [form, setForm] = useState(() => ({ store: offer?.store || "", url: offer?.url || product?.source_url || "", price: moneyInput(offer?.price, language),
    shipping: moneyInput(offer?.shipping, language), payment_method: offer?.payment_method || "cash",
    installment_count: offer?.installment_count || 1, installment_amount: moneyInput(offer?.installment_amount, language),
    notes: offer?.notes || "", recorded_at: offer?.recorded_at || today(), source: offer?.source || "manual" }));
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
      installment_amount: installment, notes: form.notes.trim() || null, recorded_at: form.recorded_at, source: form.source };
    setBusy(true);
    try { await onSave(payload); onClose(); } catch (error) { toast.error(error.message || "Não foi possível salvar a oferta."); } finally { setBusy(false); }
  };
  return <Modal title={editing ? "Editar oferta" : "Adicionar oferta"} icon={Target} hint="Salve o link, o preço e as condições desta loja." onClose={onClose} onSubmit={save} busy={busy} submitLabel={editing ? "Salvar oferta" : "Adicionar oferta"}>
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

function OfferSearchModal({ product, onClose, onSelect, language }) {
  const initialQuery = `${product.name}${product.ean ? ` ${product.ean}` : ""}`;
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [error, setError] = useState("");
  const controllerRef = useRef(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const search = async (event) => {
    event.preventDefault();
    const normalized = query.trim().replace(/\s+/g, " ");
    if (normalized.length < 2) return setError("Digite ao menos 2 caracteres para pesquisar.");
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError("");
    try {
      setResults(await searchProductOffers(product.id, normalized, { signal: controller.signal, limit: 10 }));
      setSearched(true);
    } catch (caught) {
      if (caught?.name !== "AbortError") {
        setResults([]);
        setSearched(true);
        setError(caught.message || "Não foi possível pesquisar ofertas agora.");
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setBusy(false);
      }
    }
  };
  const directUrl = async (result) => {
    if (!result.resolution_token) return result.url;
    setResolvingId(result.external_id);
    try {
      const resolved = await resolveProductOffer(product.id, { resolution_token: result.resolution_token, store: result.store, price: result.price });
      setResults((current) => current.map((item) => item.external_id === result.external_id ? { ...item, url: resolved.url, resolution_token: null } : item));
      return resolved.url;
    } finally {
      setResolvingId(null);
    }
  };
  const openOffer = async (result) => {
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const url = await directUrl(result);
      if (popup) popup.location.replace(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      popup?.close();
      toast.error(caught.message || "Não foi possível abrir o site da loja.");
    }
  };
  const selectOffer = async (result) => {
    try {
      const url = await directUrl(result);
      onSelect({
        external_id: result.external_id, store: result.store, url, price: result.price,
        shipping: result.shipping, payment_method: result.installment_count ? "credit" : "cash",
        installment_count: result.installment_count || 1, installment_amount: result.installment_amount,
        recorded_at: today(), source: "serpapi"
      });
    } catch (caught) {
      toast.error(caught.message || "Não foi possível confirmar o site da loja.");
    }
  };
  return <Modal title="Buscar ofertas" icon={Search} hint="Pesquise no Google Shopping e escolha um resultado para revisar antes de salvar." onClose={onClose} onSubmit={search} busy={busy} submitLabel="Buscar" busyLabel="Buscando..." className="desired-search-modal">
    <div className="field-label"><span>Produto</span><div className="desired-search-input"><Search size={17} /><input aria-label="Produto" minLength={2} maxLength={160} required value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, marca ou modelo" /></div></div>
    {error && <div className="desired-search-message error" role="alert"><Info size={17} /><span>{error}</span></div>}
    {!searched && !error && <div className="desired-search-intro"><Search size={25} /><strong>Encontre preços sem preencher tudo à mão</strong><span>Os resultados não são salvos automaticamente.</span></div>}
    {searched && !error && results.length === 0 && <div className="desired-search-message"><Info size={17} /><span>Nenhuma oferta encontrada. Tente informar marca e modelo.</span></div>}
    {results.length > 0 && <div className="desired-search-results" aria-live="polite">
      <div className="desired-search-results-heading"><strong>{results.length} {results.length === 1 ? "resultado encontrado" : "resultados encontrados"}</strong><span>Confira os dados antes de selecionar.</span></div>
      {results.map((result) => <article className="desired-search-result" key={result.external_id}>
        <div className="desired-search-result-image">{result.image_url ? <img src={result.image_url} alt="" loading="lazy" /> : <ShoppingBag size={24} />}</div>
        <div className="desired-search-result-copy"><span className="desired-search-store">{result.store}</span><h3>{result.title}</h3>
          <div className="desired-search-meta">
            {result.shipping_label && <span>{result.shipping_label}</span>}
            {result.installment_count && result.installment_amount && <span>{result.installment_count}x de {formatMoney(result.installment_amount, language)}</span>}
            {result.rating != null && <span><Star size={14} fill="currentColor" /> {result.rating.toLocaleString(language, { maximumFractionDigits: 1 })}{result.reviews != null ? ` (${result.reviews.toLocaleString(language)})` : ""}</span>}
          </div>
        </div>
        <div className="desired-search-result-side"><strong>{formatMoney(result.price, language)}</strong><div><button type="button" className="btn btn-ghost compact" disabled={resolvingId === result.external_id} onClick={() => openOffer(result)}>{resolvingId === result.external_id ? <Loader2 className="spin" size={14} /> : <ArrowUpRight size={14} />} Ver oferta</button><button type="button" className="btn btn-primary compact" disabled={resolvingId === result.external_id} onClick={() => selectOffer(result)}>{resolvingId === result.external_id ? <Loader2 className="spin" size={14} /> : null} Selecionar oferta</button></div></div>
      </article>)}
    </div>}
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

function OfferPagination({ page, total, label, onPageChange }) {
  const totalPages = Math.ceil(total / OFFERS_PER_PAGE);
  if (totalPages <= 1) return null;
  const first = (page - 1) * OFFERS_PER_PAGE + 1;
  const last = Math.min(page * OFFERS_PER_PAGE, total);
  const pages = Array.from(new Set([1, page - 1, page, page + 1, totalPages])).filter((value) => value > 0 && value <= totalPages).sort((a, b) => a - b);
  return <nav className="desired-offers-pagination" aria-label={`Paginação das ${label}`}>
    <span>Mostrando <strong>{first}–{last}</strong> de <strong>{total}</strong></span>
    <div><button className="icon-btn small" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button>
      {pages.map((value, index) => <span key={value}>{index > 0 && value - pages[index - 1] > 1 && <i>…</i>}<button className={value === page ? "active" : ""} type="button" aria-current={value === page ? "page" : undefined} onClick={() => onPageChange(value)}>{value}</button></span>)}
      <button className="icon-btn small" type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button></div>
  </nav>;
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
  const [currentOffersPage, setCurrentOffersPage] = useState(1);
  const [expiredOffersPage, setExpiredOffersPage] = useState(1);
  useEffect(() => { onOverlayChange?.(Boolean(modal)); return () => onOverlayChange?.(false); }, [modal, onOverlayChange]);
  const loadToken = useRef(0);
  const loadController = useRef(null);
  const load = useCallback(async () => {
    const token = ++loadToken.current;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true); setError(null);
    try {
      let data;
      for (let attempt = 0; attempt <= LOAD_RETRY_DELAYS.length; attempt += 1) {
        try {
          data = productId ? [await getDesiredProduct(productId, { signal: controller.signal })] : await listDesiredProducts({ signal: controller.signal });
          break;
        } catch (caught) {
          if (controller.signal.aborted || caught?.name === "AbortError") throw caught;
          if (!isTransientLoadError(caught) || attempt === LOAD_RETRY_DELAYS.length) throw caught;
          await waitForRetry(LOAD_RETRY_DELAYS[attempt], controller.signal);
        }
      }
      if (token === loadToken.current) setProducts(data);
    } catch (caught) {
      if (!controller.signal.aborted && caught?.name !== "AbortError" && token === loadToken.current) setError(caught.message || "Não foi possível carregar os produtos.");
    } finally {
      if (loadController.current === controller) loadController.current = null;
      if (token === loadToken.current) setLoading(false);
    }
  }, [productId]);
  useEffect(() => { load(); return () => { loadToken.current++; loadController.current?.abort(); }; }, [load]);
  const selected = products.find((item) => String(item.id) === productId);
  useEffect(() => { setOffersExpanded(false); setExpiredOffersExpanded(false); setCurrentOffersPage(1); setExpiredOffersPage(1); }, [selected?.id]);
  useEffect(() => { if (!offersExpanded) setExpiredOffersExpanded(false); }, [offersExpanded]);
  const currentOffers = selected?.offers.filter((offer) => !offer.is_expired).sort((a, b) => a.total_cost - b.total_cost) || [];
  const expiredOffers = selected?.offers.filter((offer) => offer.is_expired).sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at))) || [];
  const currentOffersPages = Math.max(1, Math.ceil(currentOffers.length / OFFERS_PER_PAGE));
  const expiredOffersPages = Math.max(1, Math.ceil(expiredOffers.length / OFFERS_PER_PAGE));
  useEffect(() => { setCurrentOffersPage((page) => Math.min(page, currentOffersPages)); }, [currentOffersPages]);
  useEffect(() => { setExpiredOffersPage((page) => Math.min(page, expiredOffersPages)); }, [expiredOffersPages]);
  const pagedCurrentOffers = currentOffers.slice((currentOffersPage - 1) * OFFERS_PER_PAGE, currentOffersPage * OFFERS_PER_PAGE);
  const pagedExpiredOffers = expiredOffers.slice((expiredOffersPage - 1) * OFFERS_PER_PAGE, expiredOffersPage * OFFERS_PER_PAGE);
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
    const editing = Boolean(modal.offer?.id);
    upsert(editing ? await updateProductOffer(selected.id, modal.offer.id, payload) : await createProductOffer(selected.id, payload));
    toast.success(editing ? "Oferta atualizada" : "Oferta adicionada");
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
      {selected ? <div className="desired-header-actions"><button className="btn btn-ghost" disabled={loading || Boolean(error)} onClick={() => setModal({ type: "offer-search" })}><Search size={17} /> Buscar ofertas</button><button className="btn btn-primary" disabled={loading || Boolean(error)} onClick={() => setModal({ type: "offer" })}><Plus size={17} /> Adicionar oferta</button></div>
        : <button className="btn btn-primary" disabled={loading || Boolean(error) || Boolean(productId)} onClick={() => setModal({ type: "product" })}><Plus size={17} /> Novo produto</button>}</header>
    {loading && <div className="card desired-empty desired-loading-state"><Loader2 className="spin" size={28} /><h2>Carregando produtos...</h2></div>}
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
          {selected.offers.length > 0 && <PriceTrendChart offers={selected.offers} targetPrice={selected.target_price} language={language} />}
          {selected.status === "bought" && <div className="desired-purchase"><span className="desired-purchase-icon"><Check size={17} /></span><div><strong>Compra registrada</strong><span>{selected.purchase_store || "Oferta removida"} · {formatMoney(selected.paid_price, language)} · {dateLabel(selected.purchase_date, language)}</span>
            <small>{PAYMENTS[selected.purchase_payment_method]}{selected.purchase_installment_count ? ` · ${selected.purchase_installment_count}x de ${formatMoney(selected.purchase_installment_amount, language)}` : ""}</small></div>
            {selected.offers.length > 0 && <button className="btn btn-ghost compact" onClick={() => setModal({ type: "purchase" })}>Editar compra</button>}</div>}
        </aside>
      </div>

      <section className={`card desired-offers-section ${offersExpanded ? "expanded" : ""}`}>
        <header className="desired-offer-head">
          <button type="button" className="desired-offers-toggle" aria-expanded={offersExpanded} aria-controls="desired-offers-panel" aria-label={`${offersExpanded ? "Ocultar" : "Ver"} ofertas (${selected.offer_count})`} onClick={() => setOffersExpanded((current) => !current)}><div><p className="eyebrow">PESQUISA DE PREÇOS</p><h2>Ofertas ({selected.offer_count})</h2><p>Compare valores, frete e formas de pagamento em um só lugar.</p></div><ChevronDown className="desired-offers-chevron" size={20} /></button>
          <div className="desired-offer-head-actions"><button className="btn btn-ghost" onClick={() => setModal({ type: "offer-search" })}><Search size={16} /> Buscar ofertas</button><button className="btn btn-ghost" onClick={() => setModal({ type: "offer" })}><Plus size={16} /> Adicionar oferta</button></div>
        </header>
        <div id="desired-offers-panel" className="desired-offers-panel" hidden={!offersExpanded}>
          {selected.offers.length === 0 ? <div className="desired-empty desired-offers-empty"><span><ShoppingBag size={26} /></span><h3>Nenhuma oferta cadastrada</h3><p>Adicione a primeira loja e comece a acompanhar os preços.</p><button className="btn btn-primary compact" onClick={() => setModal({ type: "offer" })}><Plus size={15} /> Adicionar oferta</button></div>
            : <div className="desired-offer-groups">
              {currentOffers.length > 0 ? <section className="desired-current-offers" aria-label="Ofertas atuais"><header><strong>Ofertas atuais</strong><small>{currentOffers.length} {currentOffers.length === 1 ? "preço válido" : "preços válidos"}</small></header><div className="desired-offers">{pagedCurrentOffers.map((offer) => <OfferCard key={offer.id} offer={offer} bestOfferId={selected.best_offer_id} language={language} onEdit={(item) => setModal({ type: "offer", offer: item })} onDelete={(item) => setModal({ type: "delete-offer", offer: item })} />)}</div><OfferPagination page={currentOffersPage} total={currentOffers.length} label="ofertas atuais" onPageChange={setCurrentOffersPage} /></section>
                : <div className="desired-current-offers-empty"><Info size={16} /><span>Nenhuma oferta atual para comparar.</span></div>}
              {expiredOffers.length > 0 && <section className={`desired-expired-offers ${expiredOffersExpanded ? "expanded" : ""}`}>
                <button type="button" className="desired-expired-toggle" aria-expanded={expiredOffersExpanded} aria-controls="desired-expired-offers-panel" onClick={() => setExpiredOffersExpanded((current) => !current)}><span><CalendarDays size={17} /><span><strong>Ofertas vencidas ({expiredOffers.length})</strong><small>Preços com mais de 30 dias não entram na comparação.</small></span></span><ChevronDown size={18} /></button>
                <div id="desired-expired-offers-panel" className="desired-expired-panel" hidden={!expiredOffersExpanded}><div className="desired-offers">{pagedExpiredOffers.map((offer) => <OfferCard key={offer.id} offer={offer} bestOfferId={selected.best_offer_id} language={language} onEdit={(item) => setModal({ type: "offer", offer: item })} onDelete={(item) => setModal({ type: "delete-offer", offer: item })} />)}</div><OfferPagination page={expiredOffersPage} total={expiredOffers.length} label="ofertas vencidas" onPageChange={setExpiredOffersPage} /></div>
              </section>}
            </div>}
        </div>
      </section>
    </div>}
    {modal?.type === "product" && <ProductEditor key={modal.product?.id || "new"} product={modal.product} categories={availableCategories} onCreateCategory={onCreateCategory} onClose={() => setModal(null)} onSave={saveProduct} language={language} />}
    {modal?.type === "offer-search" && selected && <OfferSearchModal product={selected} onClose={() => setModal(null)} onSelect={(offer) => setModal({ type: "offer", offer })} language={language} />}
    {modal?.type === "offer" && selected && <OfferEditor key={modal.offer?.id || modal.offer?.external_id || "new"} offer={modal.offer} product={selected} onClose={() => setModal(null)} onSave={saveOffer} language={language} />}
    {modal?.type === "purchase" && selected && <PurchaseEditor product={selected} onClose={() => setModal(null)} onSave={async (payload) => { upsert(await recordProductPurchase(selected.id, payload)); toast.success("Compra registrada"); }} language={language} />}
    {modal?.type?.startsWith("delete-") && <Modal title={modal.offer ? "Excluir oferta?" : "Excluir produto?"} icon={Trash2} onClose={() => setModal(null)} onSubmit={remove} busy={busy} submitLabel="Excluir" danger><p>{modal.offer ? "A oferta será removida da comparação. O histórico e os dados de compras registradas serão preservados." : "O produto, suas ofertas e seus históricos serão excluídos."}</p></Modal>}
  </section>;
}
