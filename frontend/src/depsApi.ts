/**
 * Dependencies Dashboard — API types and fetch functions.
 *
 * Mirrors the pattern in api.ts (Dependabot) and secretsApi.ts (Secrets).
 * All endpoints are prefixed with /deps/* and require a JWT Bearer token.
 * Requests that receive a 401 auto-clear the token and redirect to login.
 */
import { getStoredToken } from './AuthContext'

/** Base URL — proxied by Vite to the FastAPI backend (:8000) */
const BASE = '/api'

// ── Response types from the /deps/* endpoints ─────────────────────────────

/** Distinct filter values returned by GET /deps/filter-options */
export interface DepsFilterOptions {
  package_files:  string[]   // e.g. ['package.json', 'requirements.txt']
  is_open_source: string[]   // e.g. ['true', 'false']
}

/** Summary metrics returned by GET /deps/metrics */
export interface DepsMetrics {
  total_entries: number        // total rows in the CSV
  unique_dependencies: number  // COUNT(DISTINCT dependency_name)
  repos: number                // COUNT(DISTINCT repo_name)
  orgs: number                 // COUNT(DISTINCT org_name)
  package_files: number        // COUNT(DISTINCT package_name)
  open_source: number          // rows where is_open_source = 'true'
  not_open_source: number      // rows where is_open_source != 'true'
}

/** Single row in the dependencies table */
export interface DepsRow {
  org_name: string
  repo_name: string
  package_name: string        // e.g. 'package.json', 'requirements.txt'
  dependency_name: string     // e.g. 'express', 'flask==3.0.0'
  is_open_source: string | null
}

/** Paginated response from GET /deps/list */
export interface DepsListResponse {
  total: number
  page: number
  page_size: number
  total_pages: number
  rows: DepsRow[]
}

/** Active filter state managed by useDepsFilters hook */
export interface DepsFilters {
  search:         string       // free-text ILIKE search
  org:            string[]     // selected organization names
  repo:           string[]     // selected repository names
  package_file:   string[]     // selected package file types
  is_open_source: string       // '' (all) | 'true' | 'false'
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Build a URL query string from the active filters + any extra params */
function qs(filters: DepsFilters, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams()
  if (filters.search) p.set('search', filters.search)
  filters.org.forEach(v          => p.append('org', v))
  filters.repo.forEach(v         => p.append('repo', v))
  filters.package_file.forEach(v => p.append('package_file', v))
  if (filters.is_open_source)     p.set('is_open_source', filters.is_open_source)
  Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)))
  return p.toString()
}

/** Authenticated GET request — auto-clears token on 401 */
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

// ── Public API object ─────────────────────────────────────────────────────

export const depsApi = {
  /** Fetch distinct filter values for sidebar dropdowns */
  filterOptions: () => get<DepsFilterOptions>('/deps/filter-options'),
  /** Typeahead search for organization names (ILIKE, max 50 results) */
  searchOrgs:    (q: string) => get<string[]>(`/deps/filter-options/orgs?q=${encodeURIComponent(q)}&limit=50`),
  /** Typeahead search for repository names (ILIKE, max 50 results) */
  searchRepos:   (q: string) => get<string[]>(`/deps/filter-options/repos?q=${encodeURIComponent(q)}&limit=50`),
  /** Fetch aggregate summary metrics */
  metrics:       () => get<DepsMetrics>('/deps/metrics'),

  /** Fetch a page of filtered dependency rows (server-side pagination) */
  list: (filters: DepsFilters, page: number, pageSize: number) =>
    get<DepsListResponse>(`/deps/list?${qs(filters, { page, page_size: pageSize })}`),

  // ── Chart data endpoints ──────────────────────────────────────────────
  /** Dependency count grouped by package file (e.g. package.json) */
  chartPackageFile:    () => get<{package_file:string,count:number}[]>('/deps/charts/package-file'),
  /** Top orgs by dependency count */
  chartOrg:            () => get<{org:string,total_deps:number,unique_deps:number,repos:number}[]>('/deps/charts/org'),
  /** Top repos by dependency count */
  chartRepo:           () => get<{repo:string,org:string,total_deps:number,unique_deps:number}[]>('/deps/charts/repo'),
  /** Most commonly used dependencies across all repos */
  chartTopDeps:        () => get<{dependency:string,repo_count:number,repos:number}[]>('/deps/charts/top-dependencies'),
  /** Open source vs non-open source pie chart data */
  chartOpenSource:     () => get<{category:string,count:number}[]>('/deps/charts/open-source'),

  /** Build the export URL (browser navigates to this to download CSV) */
  exportUrl: (filters: DepsFilters) => `${BASE}/deps/list/export?${qs(filters)}`,

  /** Upload a dependencies CSV file for ingestion into DuckDB */
  upload: async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const token = getStoredToken()
    const r = await fetch(`${BASE}/deps/upload`, {
      method: 'POST',
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!r.ok) throw new Error('Upload failed')
    return r.json()
  },
}
