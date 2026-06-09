export default function Loading() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-32 rounded" style={{ background: 'var(--line)' }} />
        <div className="h-8 w-64 rounded" style={{ background: 'var(--line)' }} />
        <div className="h-6 w-full rounded" style={{ background: 'var(--line)' }} />
        <div
          className="h-48 w-full rounded-[var(--radius)]"
          style={{ background: 'var(--line)' }}
        />
      </div>
    </main>
  );
}
