import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts'
import { api } from '../api'
import { SEV_COLOR } from '../badges'

const GRID  = '#1f2937'
const LABEL = '#6b7280'

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '16px 18px',
    }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: '#e5e7eb' }}>{title}</h3>
      {children}
    </div>
  )
}

export default function Charts() {
  const sev  = useQuery({ queryKey: ['chart-severity'],  queryFn: api.chartSeverity  })
  const st   = useQuery({ queryKey: ['chart-state'],     queryFn: api.chartState     })
  const eco  = useQuery({ queryKey: ['chart-ecosystem'], queryFn: api.chartEcosystem })
  const org  = useQuery({ queryKey: ['chart-org'],       queryFn: api.chartOrg       })
  const trnd = useQuery({ queryKey: ['chart-trend'],     queryFn: api.chartTrend     })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

      {/* Severity pie */}
      <ChartCard title="Severity Distribution">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={sev.data ?? []} dataKey="count" nameKey="Severity"
                 cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) =>
                   `${name} ${(percent * 100).toFixed(0)}%`}
                 labelLine={false}>
              {(sev.data ?? []).map(d => (
                <Cell key={d.Severity} fill={SEV_COLOR[d.Severity?.toLowerCase()] ?? '#6b7280'} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* State bar */}
      <ChartCard title="Alert State">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={st.data ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="State" tick={{ fill: LABEL, fontSize: 12 }} />
            <YAxis tick={{ fill: LABEL, fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }} />
            <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Ecosystem bar (horizontal) */}
      <ChartCard title="Top Ecosystems">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={eco.data ?? []} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis type="number" tick={{ fill: LABEL, fontSize: 11 }} />
            <YAxis dataKey="ecosystem" type="category" width={80} tick={{ fill: LABEL, fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }} />
            <Bar dataKey="count" fill="#10b981" radius={[0,4,4,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Trend area */}
      <ChartCard title="Alert Discovery Trend">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={trnd.data ?? []}>
            <defs>
              <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="date" tick={{ fill: LABEL, fontSize: 10 }}
                   tickFormatter={v => v?.slice(0, 7)} />
            <YAxis tick={{ fill: LABEL, fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }} />
            <Area type="monotone" dataKey="count" stroke="#3b82f6"
                  fill="url(#trendGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Org table – spans 2 cols */}
      <ChartCard title="Top Organizations">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1f2937' }}>
                {['Organization', 'Total', 'Open', 'Repos'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(org.data ?? []).map(row => (
                <tr key={row.org} style={{ borderBottom: '1px solid #111827' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1f2937')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '7px 10px', color: '#e5e7eb' }}>{row.org}</td>
                  <td style={{ padding: '7px 10px', color: '#9ca3af' }}>{row.total.toLocaleString()}</td>
                  <td style={{ padding: '7px 10px', color: '#4ade80' }}>{row.open.toLocaleString()}</td>
                  <td style={{ padding: '7px 10px', color: '#9ca3af' }}>{row.repos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

    </div>
  )
}
