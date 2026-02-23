import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { secretsApi } from '../../secretsApi'
import type { SecretsFilters } from '../../secretsApi'
import { X, Filter, Search } from 'lucide-react'

interface Props {
  filters: SecretsFilters
  set: <K extends keyof SecretsFilters>(key: K, val: SecretsFilters[K]) => void
  clear: () => void
  hasActive: boolean
  onUpload: (f: File) => void
}

export default function SecretsSidebar({ filters, set, clear, hasActive, onUpload }: Props) {
  const { data: opts, isLoading } = useQuery({
    queryKey: ['secrets-filter-options'],
    queryFn: secretsApi.filterOptions,
  })

  return (
    <aside style={{
      width: 260, minWidth: 260, background: '#111827',
      borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column',
      height: '100vh', overflowY: 'auto', padding: '20px 16px', gap: 20,
    }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f9fafb', margin: 0 }}>
          🔑 Secret Scanning
        </h2>
        <p style={{ color: '#6b7280', fontSize: 12, margin: '4px 0 0' }}>
          Exposed Secrets Dashboard
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
          placeholder="Secret type, repo, path, org…"
          value={filters.search}
          onChange={e => set('search', e.target.value)}
        />
      </div>

      {isLoading ? (
        <p style={{ color: '#6b7280', fontSize: 12 }}>Loading filters…</p>
      ) : opts ? (
        <>
          <MultiSelect label="Secret Type" options={opts.secret_types} value={filters.secret_type} onChange={v => set('secret_type', v)} />
          <MultiSelect label="State"       options={opts.states}       value={filters.state}       onChange={v => set('state', v)} />
          <MultiSelect label="Validity"    options={opts.validities}   value={filters.validity}    onChange={v => set('validity', v)} />
          <OrgTypeahead value={filters.org} onChange={v => set('org', v)} />
        </>
      ) : null}
    </aside>
  )
}

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

function OrgTypeahead({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: suggestions = [] } = useQuery({
    queryKey: ['secrets-org-search', query],
    queryFn: () => secretsApi.searchOrgs(query),
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
      {open && query && filtered.length === 0 && (
        <div style={{ marginTop: 4, padding: '8px 10px', fontSize: 12, color: '#6b7280', background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }}>
          No matching organizations
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  color: '#6b7280', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.05em', display: 'block', marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', background: '#1f2937',
  border: '1px solid #374151', borderRadius: 6, color: '#f9fafb',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
