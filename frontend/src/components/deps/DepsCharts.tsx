/**
 * DepsCharts — Recharts visualisations for the Dependencies dashboard.
 *
 * Renders a 2-column grid of 5 charts:
 *   1. Open Source Breakdown (pie chart)
 *   2. Dependencies by Package File (horizontal bar)
 *   3. Most Common Dependencies (horizontal bar, top 20)
 *   4. Top Repos by Dependency Count (horizontal bar with total + unique)
 *   5. Top Organizations (table with total deps, unique deps, repos)
 *
 * All data is fetched from /deps/charts/* via TanStack Query.
 */
import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { depsApi } from '../../depsApi'

// ── Chart colour constants ────────────────────────────────────────────────
const GRID  = '#1f2937'   // grid line colour (dark theme)
const LABEL = '#6b7280'   // axis label colour

/** Colour map for the open source pie chart */
const OS_COLOR: Record<string, string> = {
  'Open Source':     '#4ade80',   // green
  'Not Open Source': '#ef4444',   // red
}

/** Palette for multi-series bar charts (unused currently but available) */
const BAR_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#10b981', '#f97316']

/** Reusable dark-themed card wrapper for each chart */
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

export default function DepsCharts() {
  // ── Fetch all chart data in parallel via TanStack Query ───────────────
  const pkg  = useQuery({ queryKey: ['deps-chart-pkg'],     queryFn: depsApi.chartPackageFile })
  const org  = useQuery({ queryKey: ['deps-chart-org'],     queryFn: depsApi.chartOrg })
  const repo = useQuery({ queryKey: ['deps-chart-repo'],    queryFn: depsApi.chartRepo })
  const top  = useQuery({ queryKey: ['deps-chart-top'],     queryFn: depsApi.chartTopDeps })
  const os   = useQuery({ queryKey: ['deps-chart-os'],      queryFn: depsApi.chartOpenSource })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

      {/* ── 1. Open Source pie chart ─────────────────────────────────── */}
      <ChartCard title="Open Source Breakdown">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={os.data ?? []} dataKey="count" nameKey="category"
                 cx="50%" cy="50%" outerRadius={90}
                 label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                 labelLine={false}>
              {(os.data ?? []).map(d => (
                <Cell key={d.category} fill={OS_COLOR[d.category] ?? '#6b7280'} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── 2. Package file horizontal bar chart ─────────────────────── */}
      <ChartCard title="Dependencies by Package File">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={pkg.data ?? []} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis type="number" tick={{ fill: LABEL, fontSize: 11 }} />
            <YAxis dataKey="package_file" type="category" width={130} tick={{ fill: LABEL, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }} />
            <Bar dataKey="count" fill="#f59e0b" radius={[0,4,4,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── 3. Most common dependencies bar chart (top 20) ───────────── */}
      <ChartCard title="Most Common Dependencies">
        <ResponsiveContainer width="100%" height={420}>
          <BarChart data={top.data ?? []} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis type="number" tick={{ fill: LABEL, fontSize: 11 }} />
            <YAxis dataKey="dependency" type="category" width={160} tick={{ fill: LABEL, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }} />
            <Bar dataKey="repo_count" fill="#3b82f6" radius={[0,4,4,0]} name="Repo count" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── 4. Top repos bar chart (total + unique deps) ─────────────── */}
      <ChartCard title="Top Repos by Dependency Count">
        <ResponsiveContainer width="100%" height={420}>
          <BarChart data={repo.data ?? []} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis type="number" tick={{ fill: LABEL, fontSize: 11 }} />
            <YAxis dataKey="repo" type="category" width={140} tick={{ fill: LABEL, fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }}
              formatter={(value: number, name: string) => [value.toLocaleString(), name]}
            />
            <Bar dataKey="total_deps" fill="#8b5cf6" radius={[0,4,4,0]} name="Total deps" />
            <Bar dataKey="unique_deps" fill="#06b6d4" radius={[0,4,4,0]} name="Unique deps" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── 5. Top organizations summary table ───────────────────────── */}
      <ChartCard title="Top Organizations">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1f2937' }}>
                {['Organization', 'Total Deps', 'Unique Deps', 'Repos'].map(h => (
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
                  <td style={{ padding: '7px 10px', color: '#9ca3af' }}>{row.total_deps.toLocaleString()}</td>
                  <td style={{ padding: '7px 10px', color: '#60a5fa' }}>{row.unique_deps.toLocaleString()}</td>
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
