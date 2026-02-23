import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

interface StatCard {
  label: string; value: string | number; color?: string; icon: string
}

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

export default function MetricsBar() {
  const { data: m, isLoading } = useQuery({ queryKey: ['metrics'], queryFn: api.metrics })

  if (isLoading) return <div style={{ color: '#6b7280', padding: 16 }}>Loading metrics…</div>
  if (!m) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
      <Card icon="🔔" label="Total"       value={m.total} />
      <Card icon="🟢" label="Open"        value={m.open}       color="#4ade80" />
      <Card icon="✅" label="Fixed"       value={m.fixed}      color="#60a5fa" />
      <Card icon="🚫" label="Dismissed"   value={m.dismissed}  color="#9ca3af" />
      <Card icon="🟣" label="Critical"    value={m.critical}   color="#9b59b6" />
      <Card icon="🔴" label="High"        value={m.high}       color="#e74c3c" />
      <Card icon="🟠" label="Medium"      value={m.medium}     color="#f39c12" />
      <Card icon="🟡" label="Low"         value={m.low}        color="#f1c40f" />
      <Card icon="📦" label="CVEs"        value={m.cves} />
      <Card icon="📂" label="Repos"       value={m.repos} />
      <Card icon="🏢" label="Orgs"        value={m.orgs} />
      <Card icon="📏" label="Avg CVSS"    value={m.avg_cvss?.toFixed(1) ?? '—'} />
    </div>
  )
}
