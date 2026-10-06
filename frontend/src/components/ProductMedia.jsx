import { useEffect, useRef, useState } from "react";
import { ImagePlus, Pause, Play, Volume2, VolumeX } from "lucide-react";
import "./productMedia.css";

export const DEFAULT_MEDIA_FRAME = { fit: "contain", x: 50, y: 50, zoom: 1 };

export function mediaTypeForUrl(value) {
  try {
    const url = new URL(value);
    // Signed/CDN links sometimes carry the filename in a query parameter.
    const names = [url.pathname, ...url.searchParams.values()];
    if (names.some((name) => /\.(mp4|webm|ogv|ogg|mov|m4v)(?:$|[?#])/i.test(name))) return "video";
  } catch { /* Incomplete input has no preview yet. */ }
  return "image";
}

function Video({ source, alt, style, onError, onLoad }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playbackError, setPlaybackError] = useState(false);
  const play = () => {
    const promise = ref.current?.play();
    promise?.catch(() => setPlaybackError(true));
  };
  useEffect(() => {
    ref.current.muted = true;
    play();
    // Autoplay rejection does not mean the file is invalid; retain manual play.
  }, [source]);
  return <>
    <video ref={ref} src={source} className="product-media-content" style={style} aria-label={alt}
      autoPlay muted={muted} loop playsInline preload="auto" onError={onError}
      onLoadedData={onLoad} onPlay={() => { setPlaying(true); setPlaybackError(false); }} onPause={() => setPlaying(false)} />
    <div className="product-media-playback">
      <button type="button" aria-label={playing ? "Pausar vídeo" : "Reproduzir vídeo"} onClick={() => {
        if (ref.current.paused) play(); else ref.current.pause();
      }}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
      <button type="button" aria-label={muted ? "Ativar som" : "Silenciar vídeo"} onClick={() => setMuted((value) => !value)}>
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      {playbackError && <small role="status">Toque para reproduzir</small>}
    </div>
  </>;
}

function LoadedMedia({ source, initialType, frame, alt, onTypeDetected }) {
  const [type, setType] = useState(initialType);
  const [retried, setRetried] = useState(false);
  const [failed, setFailed] = useState(false);
  const style = {
    objectFit: frame.fit, objectPosition: `${frame.x}% ${frame.y}%`,
    transform: `scale(${frame.zoom})`, transformOrigin: `${frame.x}% ${frame.y}%`,
  };
  const error = () => {
    if (!retried && /^https?:/i.test(source)) {
      setRetried(true);
      setType((value) => value === "image" ? "video" : "image");
    } else setFailed(true);
  };
  if (failed) return <small className="product-media-error" role="status">Não foi possível carregar a mídia. Confira o link direto do arquivo.</small>;
  return type === "video"
    ? <Video source={source} alt={alt} style={style} onError={error} onLoad={() => onTypeDetected?.(type, source)} />
    : <img src={source} className="product-media-content" style={style} alt={alt} draggable={false}
        onError={error} onLoad={() => onTypeDetected?.(type, source)} />;
}

export default function ProductMedia({ product, alt, onTypeDetected }) {
  const source = product.media_url || product.image_data;
  const frame = { ...DEFAULT_MEDIA_FRAME, ...product.media_frame };
  const initialType = product.media_url ? product.media_type || mediaTypeForUrl(source) : "image";
  return <div className="product-media">
    {source ? <LoadedMedia key={source} source={source} initialType={initialType} frame={frame} alt={alt} onTypeDetected={onTypeDetected} /> : <ImagePlus size={36} />}
  </div>;
}
