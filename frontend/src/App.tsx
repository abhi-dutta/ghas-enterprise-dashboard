import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { secretsApi } from './secretsApi'
import { depsApi } from './depsApi'
import { useFilters } from './useFilters'
import { useSecretsFilters } from './useSecretsFilters'
import { useDepsFilters } from './useDepsFilters'
import { useAuth } from './AuthContext'
import Sidebar from './components/Sidebar'
import MetricsBar from './components/MetricsBar'
import Charts from './components/Charts'
import AlertsTable from './components/AlertsTable'
import SecretsSidebar from './components/secrets/SecretsSidebar'
import SecretsMetricsBar from './components/secrets/SecretsMetricsBar'
import SecretsCharts from './components/secrets/SecretsCharts'
import SecretsAlertsTable from './components/secrets/SecretsAlertsTable'
import DepsSidebar from './components/deps/DepsSidebar'
import DepsMetricsBar from './components/deps/DepsMetricsBar'
import DepsCharts from './components/deps/DepsCharts'
import DepsTable from './components/deps/DepsTable'
import LoginPage from './components/LoginPage'
import LandingPage from './components/LandingPage'
import { BarChart2, Table2, LogOut, Shield, KeyRound, Home, Package } from 'lucide-react'

type Dashboard = 'overview' | 'dependabot' | 'secrets' | 'dependencies'
type Tab = 'charts' | 'table'

export default function App() {
  const { isAuthenticated, username, logout } = useAuth()

  if (!isAuthenticated) return <LoginPage />

  return <AppShell username={username!} onLogout={logout} />
}

function AppShell({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [dashboard, setDashboard] = useState<Dashboard>('overview')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117', color: '#f9fafb' }}>

      {/* ── Global top nav ────────────────────────────────────────── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 48, flexShrink: 0,
        background: '#010409', borderBottom: '1px solid #1f2937',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            onClick={() => setDashboard('overview')}
            style={{ fontSize: 16, fontWeight: 700, color: '#f9fafb', marginRight: 16, cursor: 'pointer' }}
          >
            🛡️ GHAS Dashboard
          </span>
          {([
            ['overview',     <Home size={14} />,       'Overview'],
            ['dependabot',   <Shield size={14} />,     'Dependabot'],
            ['secrets',      <KeyRound size={14} />,   'Secret Scanning'],
            ['dependencies', <Package size={14} />,    'Dependencies'],
          ] as const).map(([id, icon, label]) => (
            <button
              key={id}
              onClick={() => setDashboard(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                fontWeight: dashboard === id ? 700 : 400,
                background: dashboard === id ? '#1f2937' : 'transparent',
                border: dashboard === id ? '1px solid #374151' : '1px solid transparent',
                color: dashboard === id ? '#f9fafb' : '#6b7280',
                transition: 'all 0.15s',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>👤 {username}</span>
          <button
            onClick={onLogout} title="Sign out"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 6, fontSize: 12,
              background: 'transparent', border: '1px solid #374151',
              color: '#6b7280', cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = '#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = '#374151' }}
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </nav>

      {/* ── Active dashboard ─────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {dashboard === 'overview'
          ? <LandingPage onNavigate={setDashboard} />
          : dashboard === 'dependabot'
          ? <DependabotDashboard />
          : dashboard === 'secrets'
          ? <SecretsDashboard />
          : <DependenciesDashboard />}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// ── DEPENDABOT DASHBOARD ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
function DependabotDashboard() {
  const [tab, setTab] = useState<Tab>('charts')
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [uploadMsg, setUploadMsg] = useState('')
  const queryClient = useQueryClient()
  const { filters, set, clear, hasActive } = useFilters()

  const uploadMutation = useMutation({
    mutationFn: api.upload,
    onMutate: () => { setUploadStatus('loading'); setUploadMsg('') },
    onSuccess: () => {
      setUploadStatus('idle'); setUploadMsg('✓ Uploaded & ingested!')
      queryClient.invalidateQueries()
      setTimeout(() => setUploadMsg(''), 4000)
    },
    onError: (e: Error) => { setUploadStatus('error'); setUploadMsg(e.message) },
  })

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <Sidebar filters={filters} set={set} clear={clear} hasActive={hasActive}
               onUpload={f => uploadMutation.mutate(f)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <DashboardHeader
          title="🛡️ Dependabot Alerts"
          tab={tab} setTab={setTab}
          uploadStatus={uploadStatus} uploadMsg={uploadMsg}
        />

        <main style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section>
            <SectionTitle>📊 Summary Metrics</SectionTitle>
            <MetricsBar />
          </section>
          {hasActive && <ActiveFiltersChips filters={filters} set={set} clear={clear} kind="dependabot" />}
          {tab === 'charts' && <section><SectionTitle>📈 Visualizations</SectionTitle><Charts /></section>}
          {tab === 'table' && <section style={{ flex: 1 }}><SectionTitle>📋 Alert Data · Server-Side Pagination</SectionTitle><AlertsTable filters={filters} /></section>}
        </main>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// ── SECRET SCANNING DASHBOARD ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
function SecretsDashboard() {
  const [tab, setTab] = useState<Tab>('charts')
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [uploadMsg, setUploadMsg] = useState('')
  const queryClient = useQueryClient()
  const { filters, set, clear, hasActive } = useSecretsFilters()

  const uploadMutation = useMutation({
    mutationFn: secretsApi.upload,
    onMutate: () => { setUploadStatus('loading'); setUploadMsg('') },
    onSuccess: () => {
      setUploadStatus('idle'); setUploadMsg('✓ Uploaded & ingested!')
      queryClient.invalidateQueries()
      setTimeout(() => setUploadMsg(''), 4000)
    },
    onError: (e: Error) => { setUploadStatus('error'); setUploadMsg(e.message) },
  })

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <SecretsSidebar filters={filters} set={set} clear={clear} hasActive={hasActive}
                      onUpload={f => uploadMutation.mutate(f)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <DashboardHeader
          title="🔑 Secret Scanning Alerts"
          tab={tab} setTab={setTab}
          uploadStatus={uploadStatus} uploadMsg={uploadMsg}
        />

        <main style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section>
            <SectionTitle>📊 Summary Metrics</SectionTitle>
            <SecretsMetricsBar />
          </section>
          {hasActive && <ActiveFiltersChips filters={filters} set={set} clear={clear} kind="secrets" />}
          {tab === 'charts' && <section><SectionTitle>📈 Visualizations</SectionTitle><SecretsCharts /></section>}
          {tab === 'table' && <section style={{ flex: 1 }}><SectionTitle>📋 Alert Data · Server-Side Pagination</SectionTitle><SecretsAlertsTable filters={filters} /></section>}
        </main>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// ── DEPENDENCIES DASHBOARD ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
function DependenciesDashboard() {
  const [tab, setTab] = useState<Tab>('charts')
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [uploadMsg, setUploadMsg] = useState('')
  const queryClient = useQueryClient()
  const { filters, set, clear, hasActive } = useDepsFilters()

  const uploadMutation = useMutation({
    mutationFn: depsApi.upload,
    onMutate: () => { setUploadStatus('loading'); setUploadMsg('') },
    onSuccess: () => {
      setUploadStatus('idle'); setUploadMsg('✓ Uploaded & ingested!')
      queryClient.invalidateQueries()
      setTimeout(() => setUploadMsg(''), 4000)
    },
    onError: (e: Error) => { setUploadStatus('error'); setUploadMsg(e.message) },
  })

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <DepsSidebar filters={filters} set={set} clear={clear} hasActive={hasActive}
                   onUpload={f => uploadMutation.mutate(f)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <DashboardHeader
          title="📦 Dependencies Inventory"
          tab={tab} setTab={setTab}
          uploadStatus={uploadStatus} uploadMsg={uploadMsg}
        />

        <main style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section>
            <SectionTitle>📊 Summary Metrics</SectionTitle>
            <DepsMetricsBar />
          </section>
          {hasActive && <ActiveFiltersChips filters={filters} set={set} clear={clear} kind="dependencies" />}
          {tab === 'charts' && <section><SectionTitle>📈 Visualizations</SectionTitle><DepsCharts /></section>}
          {tab === 'table' && <section style={{ flex: 1 }}><SectionTitle>📋 Dependencies Data · Server-Side Pagination</SectionTitle><DepsTable filters={filters} /></section>}
        </main>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// ── SHARED HELPERS ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function DashboardHeader({ title, tab, setTab, uploadStatus, uploadMsg }: {
  title: string; tab: Tab; setTab: (t: Tab) => void
  uploadStatus: string; uploadMsg: string
}) {
  return (
    <header style={{
      padding: '12px 24px', borderBottom: '1px solid #1f2937',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: '#0d1117', flexShrink: 0,
    }}>
      <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f9fafb' }}>
        {title}
      </h1>

      {uploadStatus === 'loading' && <span style={{ color: '#60a5fa', fontSize: 13 }}>⏳ Ingesting CSV…</span>}
      {uploadMsg && uploadStatus !== 'loading' && (
        <span style={{ color: uploadStatus === 'error' ? '#f87171' : '#4ade80', fontSize: 13 }}>{uploadMsg}</span>
      )}

      <nav style={{ display: 'flex', gap: 4 }}>
        {([['charts', <BarChart2 size={14} />, 'Charts'], ['table', <Table2 size={14} />, 'Table']] as const).map(
          ([id, icon, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              fontWeight: tab === id ? 700 : 400,
              background: tab === id ? '#1f2937' : 'transparent',
              border: tab === id ? '1px solid #374151' : '1px solid transparent',
              color: tab === id ? '#f9fafb' : '#6b7280',
              transition: 'all 0.15s',
            }}>
              {icon} {label}
            </button>
          )
        )}
      </nav>
    </header>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 14, fontWeight: 600, color: '#9ca3af', margin: '0 0 12px', letterSpacing: '0.03em' }}>
      {children}
    </h2>
  )
}

import type { Filters } from './api'
import type { SecretsFilters } from './secretsApi'
import type { DepsFilters } from './depsApi'

function ActiveFiltersChips({ filters, set, clear, kind }: {
  filters: Filters | SecretsFilters | DepsFilters
  set: (k: any, v: any) => void
  clear: () => void
  kind: 'dependabot' | 'secrets' | 'dependencies'
}) {
  const chips: { label: string; onRemove: () => void }[] = []

  if (filters.search) chips.push({ label: `"${filters.search}"`, onRemove: () => set('search', '') })

  if (kind === 'dependabot') {
    const f = filters as Filters
    f.severity.forEach(v => chips.push({ label: `severity:${v}`, onRemove: () => set('severity', f.severity.filter(x => x !== v)) }))
    f.state.forEach(v => chips.push({ label: `state:${v}`, onRemove: () => set('state', f.state.filter(x => x !== v)) }))
    f.ecosystem.forEach(v => chips.push({ label: `eco:${v}`, onRemove: () => set('ecosystem', f.ecosystem.filter(x => x !== v)) }))
    f.org.forEach(v => chips.push({ label: `org:${v}`, onRemove: () => set('org', f.org.filter(x => x !== v)) }))
  } else if (kind === 'secrets') {
    const f = filters as SecretsFilters
    f.secret_type.forEach(v => chips.push({ label: `type:${v}`, onRemove: () => set('secret_type', f.secret_type.filter(x => x !== v)) }))
    f.state.forEach(v => chips.push({ label: `state:${v}`, onRemove: () => set('state', f.state.filter(x => x !== v)) }))
    f.validity.forEach(v => chips.push({ label: `validity:${v}`, onRemove: () => set('validity', f.validity.filter(x => x !== v)) }))
    f.org.forEach(v => chips.push({ label: `org:${v}`, onRemove: () => set('org', f.org.filter(x => x !== v)) }))
  } else {
    const f = filters as DepsFilters
    f.org.forEach(v => chips.push({ label: `org:${v}`, onRemove: () => set('org', f.org.filter(x => x !== v)) }))
    f.repo.forEach(v => chips.push({ label: `repo:${v}`, onRemove: () => set('repo', f.repo.filter(x => x !== v)) }))
    f.package_file.forEach(v => chips.push({ label: `pkg:${v}`, onRemove: () => set('package_file', f.package_file.filter(x => x !== v)) }))
    if (f.is_open_source) chips.push({ label: `open_source:${f.is_open_source}`, onRemove: () => set('is_open_source', '') })
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <span style={{ color: '#6b7280', fontSize: 12 }}>Active filters:</span>
      {chips.map(({ label, onRemove }) => (
        <span key={label} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 99, fontSize: 12,
          background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
          border: '1px solid rgba(59,130,246,0.3)',
        }}>
          {label}
          <button onClick={onRemove} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#60a5fa', padding: 0, lineHeight: 1, fontSize: 14,
          }}>×</button>
        </span>
      ))}
      <button onClick={clear} style={{
        background: 'none', border: '1px solid #374151', borderRadius: 99,
        color: '#9ca3af', fontSize: 11, padding: '2px 10px', cursor: 'pointer',
      }}>
        Clear all
      </button>
    </div>
  )
}
