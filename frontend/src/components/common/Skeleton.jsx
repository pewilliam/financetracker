import { LoaderCircle } from "lucide-react";

function SkeletonCard({ className = "" }) {
  return (
    <div className={`period-skeleton-card ${className}`} aria-hidden="true">
      <i className="period-skeleton-line short" />
      <i className="period-skeleton-line value" />
      <i className="period-skeleton-line" />
    </div>
  );
}

export default function Skeleton({ variant = "dashboard", label = "Carregando dados do mês", hint = "Aguarde enquanto atualizamos os valores." }) {
  return (
    <section className={`period-loading period-loading-${variant}`} role="status" aria-live="polite" aria-busy="true">
      <div className="period-loading-status">
        <span><LoaderCircle className="spin" size={18} /></span>
        <div>
          <strong>{label}</strong>
          <small>{hint}</small>
        </div>
      </div>

      {variant === "months" ? (
        <>
          <div className="period-skeleton-heading" aria-hidden="true">
            <div><i className="period-skeleton-line short" /><i className="period-skeleton-line title" /><i className="period-skeleton-line" /></div>
            <i className="period-skeleton-control" />
          </div>
          <div className="period-skeleton-year" aria-hidden="true"><i /><span /></div>
          <div className="period-skeleton-month-grid">
            {Array.from({ length: 6 }).map((_, index) => <SkeletonCard className="month" key={index} />)}
          </div>
        </>
      ) : variant === "categories" ? (
        <>
          <SkeletonCard className="hero" />
          <div className="period-skeleton-summary-grid">{Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}</div>
          <div className="period-skeleton-split"><SkeletonCard className="chart" /><SkeletonCard className="chart" /></div>
        </>
      ) : (
        <>
          <div className="period-skeleton-summary-grid">{Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}</div>
          <SkeletonCard className="chart wide" />
          <SkeletonCard className="chart wide" />
        </>
      )}
    </section>
  );
}

