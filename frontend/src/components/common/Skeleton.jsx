export default function Skeleton() {
  return <div className="summary-grid">{Array.from({ length: 4 }).map((_, i) => <div className="card skeleton" key={i} />)}</div>;
}

