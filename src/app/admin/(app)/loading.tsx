/** Shown while an admin page loads its data (admin redesign 2026-11-10). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 border-b border-line pb-5">
        <div className="kv-skeleton h-3 w-24" />
        <div className="kv-skeleton mt-3 h-8 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="kv-skeleton h-[120px]" />)}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="kv-skeleton h-72" />
        <div className="kv-skeleton h-72" />
      </div>
    </div>
  );
}
