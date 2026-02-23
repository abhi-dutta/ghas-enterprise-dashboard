import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts'
import { secretsApi } from '../../secretsApi'

const GRID  = '#1f2937'
const LABEL = '#6b7280'

const VALIDITY_COLOR: Record<string, string> = {
  active:   '#ef4444',
  inactive: '#6b7280',
  unknown:  '#f59e0b',
}

const STATE_COLOR: Record<string, string> = {
  open:     '#4ade80',
  resolved: '#60a5fa',
}

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

export default function SecretsCharts() {
  const typ  = useQuery({ queryKey: ['secrets-chart-type'],     queryFn: secretsApi.chartSecretType })
  const st   = useQuery({ queryKey: ['secrets-chart-state'],    queryFn: secretsApi.chartState })
  const val  = useQuery({ queryKey: ['secrets-chart-validity'], queryFn: secretsApi.chartValidity })
  const org  = useQuery({ queryKey: ['secrets-chart-org'],      queryFn: secretsApi.chartOrg })
  const trnd = useQuery({ queryKey: ['secrets-chart-trend'],    queryFn: secretsApi.chartTrend })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

      {/* State pie */}
      <ChartCard title="Alert State">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={st.data ?? []} dataKey="count" nameKey="State"
                 cx="50%" cy="50%" outerRadius={90}
                 label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                 labelLine={false}>
              {(st.data ?? []).map(d => (
                <Cell key={d.State} fill={STATE_COLOR[d.State?.toLowerCase()] ?? '#6b7280'} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Validity pie */}
      <ChartCard title="Secret Validity">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={val.data ?? []} dataKey="count" nameKey="Validity"
                 cx="50%" cy="50%" outerRadius={90}
                 label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                 labelLine={false}>
              {(val.data ?? []).map(d => (
                <Cell key={d.Validity} fill={VALIDITY_COLOR[d.Validity?.toLowerCase()] ?? '#6b7280'} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Secret Type bar (horizontal) */}
      <ChartCard title="Top Secret Types">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={typ.data ?? []} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis type="number" tick={{ fill: LABEL, fontSize: 11 }} />
            <YAxis dataKey="Secret_Type" type="category" width={130} tick={{ fill: LABEL, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }} />
            <Bar dataKey="count" fill="#f59e0b" radius={[0,4,4,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Trend area */}
      <ChartCard title="Secret Discovery Trend">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={trnd.data ?? []}>
            <defs>
              <linearGradient id="secretTrendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="date" tick={{ fill: LABEL, fontSize: 10 }}
                   tickFormatter={v => v?.slice(0, 7)} />
            <YAxis tick={{ fill: LABEL, fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }} />
            <Area type="monotone" dataKey="count" stroke="#f59e0b"
                  fill="url(#secretTrendGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Org table */}
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
