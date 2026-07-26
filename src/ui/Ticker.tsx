export function Ticker({ news }: { news: string[] }) {
  if (!news.length) return null;
  return (
    <div className="ticker">
      <span className="ticker-label">TfL NEWS</span>
      <div className="ticker-items">
        {news.slice(0, 4).map((n, i) => (
          <span key={`${i}-${n.slice(0, 24)}`} className={i === 0 ? 'fresh' : ''}>
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}
