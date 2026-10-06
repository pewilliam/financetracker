import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Upload, X } from "lucide-react";
import ProductMedia, { DEFAULT_MEDIA_FRAME, mediaTypeForUrl } from "./ProductMedia.jsx";

export function validMediaUrl(value) {
  if (!value.trim()) return true;
  try { const url = new URL(value.trim()); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}

export default function ProductMediaField({ value, onChange, onUpload, busy, disabled }) {
  const uploadRef = useRef(null);
  const dragRef = useRef(null);
  const url = value.media_url.trim();
  const [previewUrl, setPreviewUrl] = useState(url);
  useEffect(() => {
    const timer = setTimeout(() => setPreviewUrl(url), 350);
    return () => clearTimeout(timer);
  }, [url]);
  const frame = { ...DEFAULT_MEDIA_FRAME, ...value.media_frame };
  const setFrame = (patch) => onChange({ media_frame: { ...frame, ...patch } });
  const hasMedia = Boolean(url || value.image_data);
  const preview = { ...value, media_url: validMediaUrl(previewUrl) ? previewUrl : null, media_frame: frame };
  const clamp = (number) => Math.round(Math.max(0, Math.min(100, number)));
  return <div className="product-media-field">
    <div className="field-label"><span>Mídia do produto</span>
      <div className="product-media-input">
        <input aria-label="URL da mídia" type="url" maxLength={2048} value={value.media_url} disabled={disabled}
          placeholder={value.image_data ? "Imagem enviada · cole uma URL para substituir" : "Cole a URL de uma imagem, GIF ou vídeo"}
          onChange={(event) => {
            const media_url = event.target.value;
            onChange({ media_url, image_data: null, media_type: mediaTypeForUrl(media_url), media_frame: { ...DEFAULT_MEDIA_FRAME } });
          }} />
        <button type="button" className="btn btn-ghost" disabled={disabled} aria-label="Enviar imagem" onClick={() => uploadRef.current?.click()}>
          {busy ? <Loader2 className="spin" size={18} /> : <Upload size={18} />}<span>Upload</span>
        </button>
        <input ref={uploadRef} className="product-media-file" aria-label="Imagem do produto" type="file" accept="image/png,image/jpeg,image/webp" onChange={onUpload} disabled={disabled} />
      </div>
      <small className="desired-hint">URL direta de imagem, GIF ou vídeo. Upload: imagem PNG, JPEG ou WebP.</small>
    </div>
    {hasMedia && <div className="product-media-editor">
      <div className="product-media-editor-header"><strong>Enquadramento</strong>
        <button type="button" className="btn btn-ghost compact" disabled={disabled} onClick={() => onChange({ image_data: null, media_url: "", media_type: "image", media_frame: { ...DEFAULT_MEDIA_FRAME } })}><X size={14} /> Remover mídia</button>
      </div>
      {(url && !validMediaUrl(url)) ? <small role="status" className="desired-hint">Informe um link HTTP ou HTTPS válido.</small> : <>
        <div className="product-media-framing" onPointerDown={(event) => {
          if (disabled || event.button !== 0 || event.target.closest("button")) return;
          const rect = event.currentTarget.getBoundingClientRect();
          dragRef.current = { pointerId: event.pointerId, left: event.clientX, top: event.clientY, x: frame.x, y: frame.y, width: rect.width, height: rect.height };
          event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          setFrame({ x: clamp(drag.x - (event.clientX - drag.left) / drag.width * 100), y: clamp(drag.y - (event.clientY - drag.top) / drag.height * 100) });
        }} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onLostPointerCapture={() => { dragRef.current = null; }}>
          <ProductMedia product={preview} alt="Prévia do produto" onTypeDetected={(media_type, source) => {
            if (source === url && media_type !== value.media_type) onChange({ media_type });
          }} />
        </div>
        <small className="desired-hint">Arraste a prévia ou use os controles para ajustar.</small>
        <div className="product-media-fit" role="group" aria-label="Ajuste da mídia">
          <button type="button" disabled={disabled} aria-pressed={frame.fit === "contain"} onClick={() => setFrame({ fit: "contain" })}>Mostrar inteira</button>
          <button type="button" disabled={disabled} aria-pressed={frame.fit === "cover"} onClick={() => setFrame({ fit: "cover" })}>Preencher área</button>
        </div>
        <div className="product-media-sliders">
          <div className="field-label"><span>Zoom <small>{Math.round(frame.zoom * 100)}%</small></span><input aria-label="Zoom da mídia" type="range" min="1" max="3" step="0.05" value={frame.zoom} disabled={disabled} onChange={(event) => setFrame({ zoom: Number(event.target.value) })} /></div>
          <div className="field-label"><span>Posição horizontal</span><input aria-label="Posição horizontal" type="range" min="0" max="100" value={frame.x} disabled={disabled} onChange={(event) => setFrame({ x: Number(event.target.value) })} /></div>
          <div className="field-label"><span>Posição vertical</span><input aria-label="Posição vertical" type="range" min="0" max="100" value={frame.y} disabled={disabled} onChange={(event) => setFrame({ y: Number(event.target.value) })} /></div>
        </div>
        <button type="button" className="btn btn-ghost compact" disabled={disabled} onClick={() => setFrame(DEFAULT_MEDIA_FRAME)}><RotateCcw size={14} /> Restaurar enquadramento</button>
      </>}
    </div>}
  </div>;
}
