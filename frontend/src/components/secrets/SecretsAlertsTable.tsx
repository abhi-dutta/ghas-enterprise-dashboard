import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { secretsApi } from '../../secretsApi'
import type { SecretAlertRow, SecretsFilters } from '../../secretsApi'
import { stateBadge } from '../../badges'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, ExternalLink } from 'lucide-react'

const ch = createColumnHelper<SecretAlertRow>()

function validityBadge(v: string) {
  const map: Record<string, { color: string; bg: string }> = {
    active:   { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    inactive: { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' },
    unknown:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  }
  const { color, bg } = map[v?.toLowerCase()] ?? { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' }
  return { color, background: bg, border: `1px solid ${color}`, borderRadius: 4,
           padding: '1px 7px', fontSize: 12, fontWeight: 600, display: 'inline-block' as const }
}

function boolBadge(v: boolean | string | null) {
  const isTrue = v === true || v === 'True' || v === 'true'
  return {
    color: isTrue ? '#ef4444' : '#6b7280',
    fontSize: 12,
    fontWeight: isTrue ? 700 : 400,
  }
}

const columns = [
  ch.accessor('Alert_Number', {
    header: '#', size: 55,
    cell: i => <span style={{ color: '#6b7280', fontSize: 12 }}>{i.getValue()}</span>,
  }),
  ch.accessor('Organization_Name', {
    header: 'Organization', size: 140,
    cell: i => <span style={{ color: '#e5e7eb', fontSize: 13 }}>{i.getValue()}</span>,
  }),
  ch.accessor('Repository_Name', {
    header: 'Repository', size: 170,
    cell: i => <span style={{ color: '#60a5fa', fontSize: 13 }}>{i.getValue()}</span>,
  }),
  ch.accessor('Secret_Type', {
    header: 'Secret Type', size: 170,
    cell: i => <span style={{ color: '#f59e0b', fontSize: 12, fontFamily: 'monospace' }}>{i.getValue()}</span>,
  }),
  ch.accessor('State', {
    header: 'State', size: 90,
    cell: i => { const v = i.getValue(); return v ? <span style={stateBadge(v)}>{v}</span> : null },
  }),
  ch.accessor('Validity', {
    header: 'Validity', size: 90,
    cell: i => { const v = i.getValue(); return v ? <span style={validityBadge(v)}>{v}</span> : <span style={{ color: '#6b7280' }}>—</span> },
  }),
  ch.accessor('Push_Protection_Bypassed', {
    header: 'Push Bypassed', size: 110,
    cell: i => {
      const v = i.getValue()
      const isTrue = v === true || v === 'True' || v === 'true'
      return <span style={boolBadge(v)}>{isTrue ? 'Yes' : 'No'}</span>
    },
  }),
  ch.accessor('Publicly_Leaked', {
    header: 'Leaked', size: 80,
    cell: i => {
      const v = i.getValue()
      const isTrue = v === true || v === 'True' || v === 'true'
      return <span style={boolBadge(v)}>{isTrue ? 'Yes' : 'No'}</span>
    },
  }),
  ch.accessor('Location_Path', {
    header: 'File', size: 200,
    cell: i => <span style={{ color: '#9ca3af', fontSize: 11, fontFamily: 'monospace' }} title={i.getValue() ?? ''}>{truncate(i.getValue() ?? '', 40)}</span>,
  }),
  ch.accessor('Created_At', {
    header: 'Created', size: 100,
    cell: i => { const v = i.getValue(); return <span style={{ color: '#6b7280', fontSize: 12 }}>{v ? fmtDate(v) : '—'}</span> },
  }),
  ch.accessor('URL', {
    header: 'GitHub', size: 80,
    cell: i => {
      const v = i.getValue()
      return v ? (
        <a href={v} target="_blank" rel="noopener noreferrer" title="View on GitHub"
           style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#60a5fa', fontSize: 12, textDecoration: 'none' }}>
          <ExternalLink size={13} /> View
        </a>
      ) : <span style={{ color: '#6b7280' }}>—</span>
    },
  }),
]

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + '…' : s }
function fmtDate(s: string) { try { return new Date(s).toISOString().slice(0, 10) } catch { return s } }

interface Props { filters: SecretsFilters }
const PAGE_SIZES = [25, 50, 100, 250]

export default function SecretsAlertsTable({ filters }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const filtersKey = JSON.stringify(filters)
  useEffect(() => { setPage(1) }, [filtersKey])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['secrets-alerts', filtersKey, page, pageSize],
    queryFn: () => secretsApi.alerts(filters, page, pageSize),
    placeholderData: prev => prev,
  })

  const table = useReactTable({
    data: data?.rows ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: data?.total_pages ?? 1,
  })

  const totalPages = data?.total_pages ?? 1
  const total = data?.total ?? 0
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const exportUrl = secretsApi.exportUrl(filters)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: '#9ca3af', fontSize: 13 }}>
          {isFetching && !isLoading
            ? <span style={{ color: '#60a5fa' }}>Updating…</span>
            : <><strong style={{ color: '#e5e7eb' }}>{total.toLocaleString()}</strong> rows</>}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ color: '#6b7280', fontSize: 12 }}>Rows/page</label>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }} style={selectStyle}>
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <a href={exportUrl} download="secret_scanning_filtered.csv" style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', background: '#1f2937', border: '1px solid #374151',
            borderRadius: 6, color: '#9ca3af', fontSize: 12, textDecoration: 'none', cursor: 'pointer',
          }}>
            <Download size={13} /> Export CSV
          </a>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #1f2937', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} style={{ borderBottom: '1px solid #1f2937', background: '#0d1117' }}>
                {hg.headers.map(h => (
                  <th key={h.id} style={{
                    padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600,
                    fontSize: 11, letterSpacing: '0.04em', whiteSpace: 'nowrap', width: h.column.columnDef.size,
                  }}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #111827' }}>
                    {columns.map((_, j) => (
                      <td key={j} style={{ padding: '10px 12px' }}>
                        <div style={{
                          height: 14, borderRadius: 4,
                          background: 'linear-gradient(90deg,#1f2937 25%,#374151 50%,#1f2937 75%)',
                          backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite',
                          width: `${40 + Math.random() * 50}%`,
                        }} />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #111827', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#111827')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} style={{ padding: '9px 12px', maxWidth: cell.column.columnDef.size, overflow: 'hidden' }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          {total > 0 ? `Rows ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}` : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <PagBtn onClick={() => setPage(1)} disabled={page === 1}><ChevronsLeft size={14} /></PagBtn>
          <PagBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft size={14} /></PagBtn>
          <span style={{ color: '#9ca3af', fontSize: 12, padding: '0 10px' }}>
            Page <strong style={{ color: '#e5e7eb' }}>{page}</strong> of <strong style={{ color: '#e5e7eb' }}>{totalPages.toLocaleString()}</strong>
          </span>
          <PagBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight size={14} /></PagBtn>
          <PagBtn onClick={() => setPage(totalPages)} disabled={page >= totalPages}><ChevronsRight size={14} /></PagBtn>
          <input type="number" min={1} max={totalPages} value={page}
            onChange={e => { const v = Number(e.target.value); if (v >= 1 && v <= totalPages) setPage(v) }}
            style={{ ...selectStyle, width: 60, textAlign: 'center' }} />
        </div>
      </div>
    </div>
  )
}

function PagBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '4px 8px', background: disabled ? '#0d1117' : '#1f2937',
      border: '1px solid #374151', borderRadius: 5,
      color: disabled ? '#374151' : '#9ca3af',
      cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
    }}>
      {children}
    </button>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '4px 8px', background: '#1f2937', border: '1px solid #374151',
  borderRadius: 5, color: '#9ca3af', fontSize: 12, outline: 'none',
}
