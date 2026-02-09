/**
 * Reusable rating card for Pedagogy, Engagement, etc.
 */
export default function RatingCard({ label, score, max = 5, trend }) {
  const value = score != null ? Number(score).toFixed(1) : '—';
  const pct = max > 0 && score != null ? (Number(score) / max) * 100 : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-2xl font-bold text-primary-600">{value}</p>
      {max > 0 && (
        <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
      {trend != null && (
        <p className="mt-2 text-xs text-gray-500">{trend}</p>
      )}
    </div>
  );
}
