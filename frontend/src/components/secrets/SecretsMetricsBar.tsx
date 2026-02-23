import { useQuery } from '@tanstack/react-query'
import { secretsApi } from '../../secretsApi'

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

export default function SecretsMetricsBar() {
  const { data: m, isLoading } = useQuery({ queryKey: ['secrets-metrics'], queryFn: secretsApi.metrics })

  if (isLoading) return <div style={{ color: '#6b7280', padding: 16 }}>Loading metrics…</div>
  if (!m) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
      <Card icon="🔔" label="Total"            value={m.total} />
      <Card icon="🟢" label="Open"             value={m.open}             color="#4ade80" />
      <Card icon="✅" label="Resolved"         value={m.resolved}         color="#60a5fa" />
      <Card icon="🟢" label="Active"           value={m.active}           color="#ef4444" />
      <Card icon="⚪" label="Inactive"         value={m.inactive}         color="#9ca3af" />
      <Card icon="❓" label="Unknown"          value={m.unknown}          color="#f59e0b" />
      <Card icon="⚠️" label="Push Bypassed"   value={m.push_bypassed}    color="#f97316" />
      <Card icon="🌐" label="Publicly Leaked"  value={m.publicly_leaked}  color="#ef4444" />
      <Card icon="🔑" label="Secret Types"     value={m.secret_types} />
      <Card icon="📂" label="Repos"            value={m.repos} />
      <Card icon="🏢" label="Orgs"             value={m.orgs} />
    </div>
  )
}
