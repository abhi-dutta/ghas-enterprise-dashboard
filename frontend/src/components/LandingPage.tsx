import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { OverviewOrgRow } from '../api'
import { Shield, KeyRound, AlertTriangle, Eye } from 'lucide-react'

// ── Heatmap colour scale ──────────────────────────────────────────────────
function heatColor(value: number, max: number): string {
  if (max === 0) return 'rgba(31,41,55,0.5)'
  const t = Math.min(value / max, 1)
  // green → yellow → orange → red
  if (t < 0.25) return `rgba(74,222,128,${0.15 + t * 1.4})`
  if (t < 0.5)  return `rgba(250,204,21,${0.2 + (t - 0.25) * 2})`
  if (t < 0.75) return `rgba(249,115,22,${0.25 + (t - 0.5) * 2})`
  return `rgba(239,68,68,${0.35 + (t - 0.75) * 2.6})`
}

function riskLevel(value: number, max: number): { label: string; color: string } {
  if (max === 0) return { label: 'None', color: '#6b7280' }
  const t = value / max
  if (t >= 0.75) return { label: 'Critical', color: '#ef4444' }
  if (t >= 0.5)  return { label: 'High', color: '#f97316' }
  if (t >= 0.25) return { label: 'Medium', color: '#eab308' }
  return { label: 'Low', color: '#4ade80' }
}

// ── Stat card ─────────────────────────────────────────────────────────────
function BigStat({ icon, label, value, color, sub }: {
  icon: React.ReactNode; label: string; value: number | string; color: string; sub?: string
}) {
  return (
    <div style={{
      background: '#111827', border: '1px solid #1f2937', borderRadius: 10,
      padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 12, fontWeight: 600 }}>
        {icon} {label}
      </div>
      <span style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1.1 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {sub && <span style={{ fontSize: 11, color: '#6b7280' }}>{sub}</span>}
    </div>
  )
}

// ── Heatmap grid cell ─────────────────────────────────────────────────────
function HeatCell({ org, value, max, onClick }: {
  org: string; value: number; max: number; onClick?: () => void
}) {
  const bg = heatColor(value, max)
  const { label, color } = riskLevel(value, max)
  return (
    <div
      onClick={onClick}
      title={`${org}: ${value.toLocaleString()} total vulnerabilities (${label} risk)`}
      style={{
        background: bg, borderRadius: 6, padding: '10px 12px',
        cursor: onClick ? 'pointer' : 'default',
        border: '1px solid rgba(255,255,255,0.05)',
        transition: 'transform 0.1s, box-shadow 0.1s',
        minWidth: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {org}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 2 }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>
        {label} Risk
      </div>
    </div>
  )
}

// ── Main landing page ─────────────────────────────────────────────────────
export default function LandingPage({ onNavigate }: {
  onNavigate: (dashboard: 'dependabot' | 'secrets') => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: api.overview,
  })

  if (isLoading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
        Loading overview…
      </div>
    )
  }
  if (!data) return null

  const dep = data.dependabot
  const sec = data.secrets
  const orgs = data.orgs
  const maxVulns = orgs.length > 0 ? orgs[0].total_vulns : 0

  const totalVulns   = (dep?.total ?? 0) + (sec?.total ?? 0)
  const totalOpen    = (dep?.open ?? 0) + (sec?.open ?? 0)
  const totalCrit    = dep?.critical ?? 0
  const totalLeaked  = sec?.publicly_leaked ?? 0
  const totalOrgs    = orgs.length

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 32 }}>

      {/* Title */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#f9fafb' }}>
          🏠 Security Overview
        </h1>
        <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
          Combined risk posture across Dependabot and Secret Scanning
        </p>
      </div>

      {/* ── Top-level combined stats ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        <BigStat icon={<AlertTriangle size={14} />} label="Total Vulnerabilities" value={totalVulns} color="#f9fafb" />
        <BigStat icon={<Eye size={14} />}           label="Open / Unresolved"     value={totalOpen}  color="#ef4444"
                 sub={`${totalVulns > 0 ? ((totalOpen / totalVulns) * 100).toFixed(1) : 0}% of total`} />
        <BigStat icon={<Shield size={14} />}        label="Dependabot Alerts"     value={dep?.total ?? 0} color="#3b82f6"
                 sub={`${dep?.open ?? 0} open · ${dep?.critical ?? 0} critical`} />
        <BigStat icon={<KeyRound size={14} />}      label="Secret Scanning"       value={sec?.total ?? 0} color="#f59e0b"
                 sub={`${sec?.open ?? 0} open · ${sec?.publicly_leaked ?? 0} leaked`} />
        <BigStat icon="🟣" label="Critical Dependabot" value={totalCrit}   color="#9b59b6" />
        <BigStat icon="🌐" label="Publicly Leaked"     value={totalLeaked} color="#ef4444" />
        <BigStat icon="🏢" label="Organizations"       value={totalOrgs}   color="#60a5fa" />
      </div>

      {/* ── Quick nav cards ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 32 }}>
        <button onClick={() => onNavigate('dependabot')} style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(59,130,246,0.02))',
          border: '1px solid rgba(59,130,246,0.25)', borderRadius: 10, padding: '20px 24px',
          cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,0.6)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,0.25)'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Shield size={18} color="#3b82f6" />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb' }}>Dependabot Dashboard →</span>
          </div>
          <span style={{ color: '#9ca3af', fontSize: 13 }}>
            {dep ? `${dep.total.toLocaleString()} alerts · ${dep.open.toLocaleString()} open · ${dep.critical.toLocaleString()} critical` : 'No data loaded'}
          </span>
        </button>

        <button onClick={() => onNavigate('secrets')} style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.02))',
          border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '20px 24px',
          cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(245,158,11,0.6)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(245,158,11,0.25)'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <KeyRound size={18} color="#f59e0b" />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb' }}>Secret Scanning Dashboard →</span>
          </div>
          <span style={{ color: '#9ca3af', fontSize: 13 }}>
            {sec ? `${sec.total.toLocaleString()} secrets · ${sec.open.toLocaleString()} open · ${sec.publicly_leaked.toLocaleString()} leaked` : 'No data loaded'}
          </span>
        </button>
      </div>

      {/* ── Organization Risk Heatmap ────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e5e7eb', margin: '0 0 6px' }}>
          🔥 Organization Risk Heatmap
        </h2>
        <p style={{ margin: '0 0 14px', color: '#6b7280', fontSize: 12 }}>
          Each tile represents an organization. Colour intensity = total vulnerability count. Hover for details.
        </p>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          {['Low', 'Medium', 'High', 'Critical'].map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 14, height: 14, borderRadius: 3,
                background: [
                  'rgba(74,222,128,0.35)',
                  'rgba(250,204,21,0.5)',
                  'rgba(249,115,22,0.6)',
                  'rgba(239,68,68,0.8)',
                ][i],
              }} />
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{label}</span>
            </div>
          ))}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 8,
        }}>
          {orgs.slice(0, 40).map(row => (
            <HeatCell key={row.org} org={row.org} value={row.total_vulns} max={maxVulns} />
          ))}
        </div>
      </div>

      {/* ── Org risk table ───────────────────────────────────────── */}
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e5e7eb', margin: '0 0 14px' }}>
          📋 Organization Risk Breakdown
        </h2>
        <div style={{ overflowX: 'auto', border: '1px solid #1f2937', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1f2937', background: '#0d1117' }}>
                {['#', 'Organization', 'Total', 'Open', 'Dep Total', 'Dep Open', 'Critical', 'High', 'Secrets', 'Sec Open', 'Leaked', 'Push Bypassed', 'Repos', 'Risk'].map(h => (
                  <th key={h} style={{
                    padding: '10px 10px', textAlign: h === 'Organization' ? 'left' : 'center',
                    color: '#6b7280', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', letterSpacing: '0.03em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgs.map((row, i) => {
                const risk = riskLevel(row.total_vulns, maxVulns)
                return (
                  <OrgRow key={row.org} row={row} rank={i + 1} risk={risk} maxVulns={maxVulns} />
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}


function OrgRow({ row, rank, risk, maxVulns }: {
  row: OverviewOrgRow; rank: number
  risk: { label: string; color: string }; maxVulns: number
}) {
  const barWidth = maxVulns > 0 ? (row.total_vulns / maxVulns) * 100 : 0
  return (
    <tr style={{ borderBottom: '1px solid #111827', transition: 'background 0.1s' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#111827')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <td style={{ padding: '9px 10px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>{rank}</td>
      <td style={{ padding: '9px 10px', color: '#e5e7eb', fontWeight: 600 }}>{row.org}</td>
      <td style={{ padding: '9px 10px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <span style={{ fontWeight: 700, color: '#f9fafb', minWidth: 40, textAlign: 'right' }}>
            {row.total_vulns.toLocaleString()}
          </span>
          <div style={{ width: 60, height: 6, background: '#1f2937', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${barWidth}%`, height: '100%', background: risk.color, borderRadius: 3 }} />
          </div>
        </div>
      </td>
      <td style={{ padding: '9px 10px', textAlign: 'center', color: '#ef4444', fontWeight: 600 }}>{row.total_open.toLocaleString()}</td>
      <td style={{ padding: '9px 10px', textAlign: 'center', color: '#3b82f6' }}>{row.dep_total.toLocaleString()}</td>
      <td style={{ padding: '9px 10px', textAlign: 'center', color: '#60a5fa' }}>{row.dep_open.toLocaleString()}</td>
      <td style={{ padding: '9px 10px', textAlign: 'center', color: '#9b59b6', fontWeight: row.dep_critical > 0 ? 700 : 400 }}>{row.dep_critical}</td>
      <td style={{ padding: '9px 10px', textAlign: 'center', color: '#e74c3c', fontWeight: row.dep_high > 0 ? 700 : 400 }}>{row.dep_high}</td>
      <td style={{ padding: '9px 10px', textAlign: 'center', color: '#f59e0b' }}>{row.sec_total.toLocaleString()}</td>
      <td style={{ padding: '9px 10px', textAlign: 'center', color: '#fbbf24' }}>{row.sec_open.toLocaleString()}</td>
      <td style={{ padding: '9px 10px', textAlign: 'center', color: row.sec_leaked > 0 ? '#ef4444' : '#6b7280', fontWeight: row.sec_leaked > 0 ? 700 : 400 }}>{row.sec_leaked}</td>
      <td style={{ padding: '9px 10px', textAlign: 'center', color: row.sec_bypassed > 0 ? '#f97316' : '#6b7280', fontWeight: row.sec_bypassed > 0 ? 700 : 400 }}>{row.sec_bypassed}</td>
      <td style={{ padding: '9px 10px', textAlign: 'center', color: '#9ca3af' }}>{row.repos}</td>
      <td style={{ padding: '9px 10px', textAlign: 'center' }}>
        <span style={{
          padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
          color: risk.color,
          background: risk.color + '18',
          border: `1px solid ${risk.color}40`,
        }}>
          {risk.label}
        </span>
      </td>
    </tr>
  )
}
