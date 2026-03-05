/**
 * DepsMetricsBar — Summary metric cards for the Dependencies dashboard.
 *
 * Displays 7 stat cards: total entries, unique dependencies, repos, orgs,
 * package file types, open source count, and non-open source count.
 * Data is fetched from GET /deps/metrics via TanStack Query.
 */
import { useQuery } from '@tanstack/react-query'
import { depsApi } from '../../depsApi'

// ── Stat card component ───────────────────────────────────────────────────
interface StatCard {
  label: string; value: string | number; color?: string; icon: string
}

/** Single metric card with icon, label, and large formatted number */
function Card({ label, value, icon, color }: StatCard) {
  return (
    <div style={{
      background: '#111827', border: '1px solid #1f2937', borderRadius: 8,
      padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ color: '#6b7280', fontSize: 12, fontWeight: 600 }}>{icon} {label}</span>
      <span style={{ fontSize: 24, fontWeight: 700, color: color ?? '#f9fafb' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  )
}

/** Grid of metric cards — auto-fills columns based on available width */
export default function DepsMetricsBar() {
  const { data: m, isLoading } = useQuery({ queryKey: ['deps-metrics'], queryFn: depsApi.metrics })

  if (isLoading) return <div style={{ color: '#6b7280', padding: 16 }}>Loading metrics…</div>
  if (!m) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
      <Card icon="📦" label="Total Entries"        value={m.total_entries} />
      <Card icon="🔗" label="Unique Dependencies"  value={m.unique_dependencies}  color="#60a5fa" />
      <Card icon="📂" label="Repos"                value={m.repos} />
      <Card icon="🏢" label="Orgs"                 value={m.orgs} />
      <Card icon="📄" label="Package Files"        value={m.package_files}        color="#f59e0b" />
      <Card icon="✅" label="Open Source"           value={m.open_source}          color="#4ade80" />
      <Card icon="🔒" label="Not Open Source"       value={m.not_open_source}      color="#ef4444" />
    </div>
  )
}
