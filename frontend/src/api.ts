// All API types and fetch functions
import { getStoredToken } from './AuthContext'

const BASE = '/api'

export interface FilterOptions {
  severities: string[]
  states:     string[]
  ecosystems: string[]
}

export interface Metrics {
  total: number; open: number; fixed: number; dismissed: number
  critical: number; high: number; medium: number; low: number
  avg_cvss: number; repos: number; orgs: number; cves: number
}

export interface AlertRow {
  Alert_Number: number
  Organization_Name: string
  Repository_Name: string
  State: string
  Severity: string
  Dependency_Package_Ecosystem: string
  Dependency_Package_Name: string
  CVE_ID: string
  CVSS_Score: number | null
  Advisory_Summary: string
  Created_At: string | null
  URL: string | null
}

export interface AlertsResponse {
  total: number
  page: number
  page_size: number
  total_pages: number
  rows: AlertRow[]
}

export interface OverviewOrgRow {
  org: string
  dep_total: number; dep_open: number; dep_critical: number; dep_high: number
  sec_total: number; sec_open: number; sec_leaked: number; sec_bypassed: number
  total_vulns: number; total_open: number; repos: number
}

export interface OverviewData {
  dependabot: Metrics | null
  secrets: { total: number; open: number; resolved: number; active: number; inactive: number; unknown: number; push_bypassed: number; publicly_leaked: number; secret_types: number; repos: number; orgs: number } | null
  orgs: OverviewOrgRow[]
}

export interface Filters {
  search:    string
  severity:  string[]
  state:     string[]
  ecosystem: string[]
  org:       string[]
}

function qs(filters: Filters, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams()
  if (filters.search)    p.set('search', filters.search)
  filters.severity.forEach(v  => p.append('severity',  v))
  filters.state.forEach(v     => p.append('state',     v))
  filters.ecosystem.forEach(v => p.append('ecosystem', v))
  filters.org.forEach(v       => p.append('org',       v))
  Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)))
  return p.toString()
}

async function get<T>(path: string): Promise<T> {
  const token = getStoredToken()
  const r = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (r.status === 401) {
    // Token expired — clear storage and reload to show login
    localStorage.removeItem('ghas_token')
    localStorage.removeItem('ghas_username')
    window.location.reload()
  }
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

export const api = {
  overview:      () => get<OverviewData>('/overview'),
  filterOptions: () => get<FilterOptions>('/filter-options'),
  searchOrgs:    (q: string) => get<string[]>(`/filter-options/orgs?q=${encodeURIComponent(q)}&limit=50`),
  metrics:       () => get<Metrics>('/metrics'),

  alerts: (filters: Filters, page: number, pageSize: number) =>
    get<AlertsResponse>(`/alerts?${qs(filters, { page, page_size: pageSize })}`),

  chartSeverity:  () => get<{Severity:string,count:number}[]>('/charts/severity'),
  chartState:     () => get<{State:string,count:number}[]>('/charts/state'),
  chartEcosystem: () => get<{ecosystem:string,count:number}[]>('/charts/ecosystem'),
  chartOrg:       () => get<{org:string,total:number,open:number,repos:number}[]>('/charts/org'),
  chartTrend:     () => get<{date:string,count:number}[]>('/charts/trend'),

  exportUrl: (filters: Filters) => `${BASE}/alerts/export?${qs(filters)}`,

  upload: async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const token = getStoredToken()
    const r = await fetch(`${BASE}/upload`, {
      method: 'POST',
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!r.ok) throw new Error('Upload failed')
    return r.json()
  },
}
