/**
 * DepsSidebar — Left sidebar for the Dependencies dashboard.
 *
 * Provides:
 *   - CSV upload button (ingests into DuckDB via POST /deps/upload)
 *   - Free-text search (ILIKE across dependency, repo, org, package file)
 *   - Package file filter (pill toggle, e.g. package.json, requirements.txt)
 *   - Open source toggle (All / Yes / No)
 *   - Organization typeahead search (ILIKE, max 50 suggestions)
 *   - Repository typeahead search (ILIKE, max 50 suggestions)
 *   - Clear all filters button
 *
 * Mirrors SecretsSidebar / Sidebar pattern from the other dashboards.
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { depsApi } from '../../depsApi'
import type { DepsFilters } from '../../depsApi'
import { X, Filter, Search } from 'lucide-react'

/** Props passed from the DependenciesDashboard parent component */
interface Props {
  filters: DepsFilters
  set: <K extends keyof DepsFilters>(key: K, val: DepsFilters[K]) => void
  clear: () => void
  hasActive: boolean
  onUpload: (f: File) => void
}

export default function DepsSidebar({ filters, set, clear, hasActive, onUpload }: Props) {
  const { data: opts, isLoading } = useQuery({
    queryKey: ['deps-filter-options'],
    queryFn: depsApi.filterOptions,
  })

  return (
    <aside style={{
      width: 260, minWidth: 260, background: '#111827',
      borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column',
      height: '100vh', overflowY: 'auto', padding: '20px 16px', gap: 20,
    }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f9fafb', margin: 0 }}>
          📦 Dependencies
        </h2>
        <p style={{ color: '#6b7280', fontSize: 12, margin: '4px 0 0' }}>
          GitHub Dependencies Inventory
        </p>
      </div>

      {/* Upload */}
      <div>
        <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
          📂 UPLOAD CSV
        </label>
        <label style={{
          display: 'block', padding: '8px 12px', background: '#1f2937',
          border: '1px dashed #374151', borderRadius: 6, cursor: 'pointer',
          color: '#9ca3af', fontSize: 13, textAlign: 'center',
        }}>
          Click to upload
          <input type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
        </label>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #1f2937', margin: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Filter size={13} /> FILTERS
        </span>
        {hasActive && (
          <button onClick={clear} style={{
            background: 'none', border: '1px solid #374151', borderRadius: 4,
            color: '#9ca3af', fontSize: 11, padding: '2px 8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <X size={11} /> Clear
          </button>
        )}
      </div>

      {/* Search */}
      <div>
        <label style={labelStyle}>Search</label>
        <input
          style={inputStyle}
          placeholder="Dependency, repo, org, package file…"
          value={filters.search}
          onChange={e => set('search', e.target.value)}
        />
      </div>

      {isLoading ? (
        <p style={{ color: '#6b7280', fontSize: 12 }}>Loading filters…</p>
      ) : opts ? (
        <>
          <MultiSelect label="Package File" options={opts.package_files} value={filters.package_file} onChange={v => set('package_file', v)} />
          <div>
            <label style={labelStyle}>Open Source</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {[
                { label: 'All', value: '' },
                { label: 'Yes', value: 'true' },
                { label: 'No', value: 'false' },
              ].map(opt => {
                const active = filters.is_open_source === opt.value
                return (
                  <button key={opt.value} onClick={() => set('is_open_source', opt.value)} style={{
                    padding: '3px 9px', borderRadius: 12, fontSize: 12, cursor: 'pointer',
                    fontWeight: active ? 700 : 400,
                    background: active ? '#3b82f6' : '#1f2937',
                    color: active ? '#fff' : '#9ca3af',
                    border: active ? '1px solid #3b82f6' : '1px solid #374151',
                    transition: 'all 0.1s',
                  }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
          <OrgTypeahead value={filters.org} onChange={v => set('org', v)} />
          <RepoTypeahead value={filters.repo} onChange={v => set('repo', v)} />
        </>
      ) : null}
    </aside>
  )
}

// ── Multi-select pill component ───────────────────────────────────────────
/** Toggle-able pill buttons for multi-value filters (e.g. package file types) */
function MultiSelect({ label, options, value, onChange }: {
  label: string; options: string[]; value: string[]; onChange: (v: string[]) => void
}) {
  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {options.map(opt => {
          const active = value.includes(opt)
          return (
            <button key={opt} onClick={() => toggle(opt)} style={{
              padding: '3px 9px', borderRadius: 12, fontSize: 12, cursor: 'pointer',
              fontWeight: active ? 700 : 400,
              background: active ? '#3b82f6' : '#1f2937',
              color: active ? '#fff' : '#9ca3af',
              border: active ? '1px solid #3b82f6' : '1px solid #374151',
              transition: 'all 0.1s',
            }}>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Organization typeahead ────────────────────────────────────────────────
/** Typeahead dropdown for filtering by organization name.
 *  Fetches suggestions from GET /deps/filter-options/orgs?q=... as the user types.
 *  Selected orgs appear as removable chips above the input. */
function OrgTypeahead({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: suggestions = [] } = useQuery({
    queryKey: ['deps-org-search', query],
    queryFn: () => depsApi.searchOrgs(query),
    enabled: open,
    placeholderData: (prev: string[] | undefined) => prev,
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const toggle = (org: string) => {
    onChange(value.includes(org) ? value.filter(v => v !== org) : [...value, org])
  }
  const filtered = suggestions.filter(s => !value.includes(s))

  return (
    <div ref={ref}>
      <label style={labelStyle}>Organization</label>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {value.map(org => (
            <span key={org} style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '2px 8px', borderRadius: 12, fontSize: 11,
              background: '#3b82f6', color: '#fff', fontWeight: 600,
            }}>
              {org}
              <button onClick={() => toggle(org)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#fff', padding: 0, lineHeight: 1, fontSize: 13,
              }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 8, top: 9, color: '#6b7280', pointerEvents: 'none' }} />
        <input style={{ ...inputStyle, paddingLeft: 28 }} placeholder="Search organizations…"
          value={query} onChange={e => { setQuery(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} />
      </div>
      {open && filtered.length > 0 && (
        <div style={{ marginTop: 4, maxHeight: 180, overflowY: 'auto', background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }}>
          {filtered.map(org => (
            <button key={org} onClick={() => { toggle(org); setQuery('') }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
              fontSize: 12, color: '#d1d5db', background: 'transparent', border: 'none',
              cursor: 'pointer', borderBottom: '1px solid #111827',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#374151')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {org}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Repository typeahead ──────────────────────────────────────────────────
/** Typeahead dropdown for filtering by repository name.
 *  Fetches suggestions from GET /deps/filter-options/repos?q=... as the user types.
 *  Selected repos appear as removable purple chips above the input. */
function RepoTypeahead({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: suggestions = [] } = useQuery({
    queryKey: ['deps-repo-search', query],
    queryFn: () => depsApi.searchRepos(query),
    enabled: open,
    placeholderData: (prev: string[] | undefined) => prev,
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const toggle = (r: string) => {
    onChange(value.includes(r) ? value.filter(v => v !== r) : [...value, r])
  }
  const filtered = suggestions.filter(s => !value.includes(s))

  return (
    <div ref={ref}>
      <label style={labelStyle}>Repository</label>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {value.map(r => (
            <span key={r} style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '2px 8px', borderRadius: 12, fontSize: 11,
              background: '#8b5cf6', color: '#fff', fontWeight: 600,
            }}>
              {r}
              <button onClick={() => toggle(r)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#fff', padding: 0, lineHeight: 1, fontSize: 13,
              }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 8, top: 9, color: '#6b7280', pointerEvents: 'none' }} />
        <input style={{ ...inputStyle, paddingLeft: 28 }} placeholder="Search repositories…"
          value={query} onChange={e => { setQuery(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} />
      </div>
      {open && filtered.length > 0 && (
        <div style={{ marginTop: 4, maxHeight: 180, overflowY: 'auto', background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }}>
          {filtered.map(r => (
            <button key={r} onClick={() => { toggle(r); setQuery('') }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
              fontSize: 12, color: '#d1d5db', background: 'transparent', border: 'none',
              cursor: 'pointer', borderBottom: '1px solid #111827',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#374151')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {r}
            </button>
          ))}
        </div>
      )}
      {open && query && filtered.length === 0 && (
        <div style={{ marginTop: 4, padding: '8px 10px', fontSize: 12, color: '#6b7280', background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }}>
          No matching repositories
        </div>
      )}
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  color: '#6b7280', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.05em', display: 'block', marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', background: '#1f2937',
  border: '1px solid #374151', borderRadius: 6, color: '#f9fafb',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
