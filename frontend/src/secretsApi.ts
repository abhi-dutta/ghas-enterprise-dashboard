// Secret Scanning API types and fetch functions
import { getStoredToken } from './AuthContext'

const BASE = '/api'

export interface SecretsFilterOptions {
  secret_types: string[]
  states:       string[]
  validities:   string[]
}

export interface SecretsMetrics {
  total: number; open: number; resolved: number
  active: number; inactive: number; unknown: number
  push_bypassed: number; publicly_leaked: number
  secret_types: number; repos: number; orgs: number
}

export interface SecretAlertRow {
  Alert_Number: number
  Organization_Name: string
  Repository_Name: string
  Secret_Type: string
  State: string
  Validity: string | null
  Resolution: string | null
  Push_Protection_Bypassed: boolean | string | null
  Publicly_Leaked: boolean | string | null
  Location_Path: string | null
  Created_At: string | null
  URL: string | null
}

export interface SecretsAlertsResponse {
  total: number
  page: number
  page_size: number
  total_pages: number
  rows: SecretAlertRow[]
}

export interface SecretsFilters {
  search:      string
  secret_type: string[]
  state:       string[]
  validity:    string[]
  org:         string[]
}

function qs(filters: SecretsFilters, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams()
  if (filters.search) p.set('search', filters.search)
  filters.secret_type.forEach(v => p.append('secret_type', v))
  filters.state.forEach(v       => p.append('state', v))
  filters.validity.forEach(v    => p.append('validity', v))
  filters.org.forEach(v         => p.append('org', v))
  Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)))
  return p.toString()
}

async function get<T>(path: string): Promise<T> {
  const token = getStoredToken()
  const r = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (r.status === 401) {
    localStorage.removeItem('ghas_token')
    localStorage.removeItem('ghas_username')
    window.location.reload()
  }
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

export const secretsApi = {
  filterOptions: () => get<SecretsFilterOptions>('/secrets/filter-options'),
  searchOrgs:    (q: string) => get<string[]>(`/secrets/filter-options/orgs?q=${encodeURIComponent(q)}&limit=50`),
  metrics:       () => get<SecretsMetrics>('/secrets/metrics'),

  alerts: (filters: SecretsFilters, page: number, pageSize: number) =>
    get<SecretsAlertsResponse>(`/secrets/alerts?${qs(filters, { page, page_size: pageSize })}`),

  chartSecretType: () => get<{Secret_Type:string,count:number}[]>('/secrets/charts/secret-type'),
  chartState:      () => get<{State:string,count:number}[]>('/secrets/charts/state'),
  chartValidity:   () => get<{Validity:string,count:number}[]>('/secrets/charts/validity'),
  chartOrg:        () => get<{org:string,total:number,open:number,repos:number}[]>('/secrets/charts/org'),
  chartTrend:      () => get<{date:string,count:number}[]>('/secrets/charts/trend'),

  exportUrl: (filters: SecretsFilters) => `${BASE}/secrets/alerts/export?${qs(filters)}`,

  upload: async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const token = getStoredToken()
    const r = await fetch(`${BASE}/secrets/upload`, {
      method: 'POST',
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!r.ok) throw new Error('Upload failed')
    return r.json()
  },
}
