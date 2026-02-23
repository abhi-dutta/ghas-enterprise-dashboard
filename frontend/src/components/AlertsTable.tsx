import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { api } from '../api'
import type { AlertRow, Filters } from '../api'
import { severityBadge, stateBadge } from '../badges'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, ExternalLink } from 'lucide-react'

const ch = createColumnHelper<AlertRow>()

const columns = [
  ch.accessor('Alert_Number', {
    header: '#',
    size: 60,
    cell: i => <span style={{ color: '#6b7280', fontSize: 12 }}>{i.getValue()}</span>,
  }),
  ch.accessor('Organization_Name', {
    header: 'Organization',
    size: 140,
    cell: i => <span style={{ color: '#e5e7eb', fontSize: 13 }}>{i.getValue()}</span>,
  }),
  ch.accessor('Repository_Name', {
    header: 'Repository',
    size: 180,
    cell: i => <span style={{ color: '#60a5fa', fontSize: 13 }}>{i.getValue()}</span>,
  }),
  ch.accessor('Severity', {
    header: 'Severity',
    size: 90,
    cell: i => {
      const v = i.getValue()
      return v ? <span style={severityBadge(v)}>{v}</span> : null
    },
  }),
  ch.accessor('State', {
    header: 'State',
    size: 100,
    cell: i => {
      const v = i.getValue()
      return v ? <span style={stateBadge(v)}>{v}</span> : null
    },
  }),
  ch.accessor('Dependency_Package_Ecosystem', {
    header: 'Ecosystem',
    size: 100,
    cell: i => <span style={{ color: '#9ca3af', fontSize: 12 }}>{i.getValue()}</span>,
  }),
  ch.accessor('Dependency_Package_Name', {
    header: 'Package',
    size: 160,
    cell: i => <span style={{ color: '#e5e7eb', fontSize: 13, fontFamily: 'monospace' }}>{i.getValue()}</span>,
  }),
  ch.accessor('CVE_ID', {
    header: 'CVE ID',
    size: 130,
    cell: i => {
      const v = i.getValue()
      return v ? (
        <a
          href={`https://nvd.nist.gov/vuln/detail/${v}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#f59e0b', fontSize: 12, textDecoration: 'none', fontFamily: 'monospace' }}
        >
          {v}
        </a>
      ) : null
    },
  }),
  ch.accessor('CVSS_Score', {
    header: 'CVSS',
    size: 65,
    cell: i => {
      const v = i.getValue()
      if (v == null) return <span style={{ color: '#6b7280' }}>—</span>
      const color = v >= 9 ? '#9b59b6' : v >= 7 ? '#e74c3c' : v >= 4 ? '#f39c12' : '#f1c40f'
      return <span style={{ color, fontWeight: 700, fontSize: 13 }}>{Number(v).toFixed(1)}</span>
    },
  }),
  ch.accessor('Advisory_Summary', {
    header: 'Summary',
    size: 280,
    cell: i => (
      <span style={{ color: '#9ca3af', fontSize: 12 }} title={i.getValue() ?? ''}>
        {truncate(i.getValue() ?? '', 80)}
      </span>
    ),
  }),
  ch.accessor('Created_At', {
    header: 'Created',
    size: 110,
    cell: i => {
      const v = i.getValue()
      return <span style={{ color: '#6b7280', fontSize: 12 }}>{v ? fmtDate(v) : '—'}</span>
    },
  }),
  ch.accessor('URL', {
    header: 'GitHub',
    size: 80,
    cell: i => {
      const v = i.getValue()
      return v ? (
        <a
          href={v}
          target="_blank"
          rel="noopener noreferrer"
          title="View alert on GitHub Security"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: '#60a5fa',
            fontSize: 12,
            textDecoration: 'none',
          }}
        >
          <ExternalLink size={13} />
          View
        </a>
      ) : <span style={{ color: '#6b7280' }}>—</span>
    },
  }),
]

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}
function fmtDate(s: string) {
  try { return new Date(s).toISOString().slice(0, 10) } catch { return s }
}

interface Props {
  filters: Filters
}

const PAGE_SIZES = [25, 50, 100, 250]

export default function AlertsTable({ filters }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Reset to page 1 whenever filters change
  const filtersKey = JSON.stringify(filters)
  useEffect(() => { setPage(1) }, [filtersKey])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['alerts', filtersKey, page, pageSize],
    queryFn: () => api.alerts(filters, page, pageSize),
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

  const exportUrl = api.exportUrl(filters)  // already prefixed with /api

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: '#9ca3af', fontSize: 13 }}>
          {isFetching && !isLoading
            ? <span style={{ color: '#60a5fa' }}>Updating…</span>
            : <><strong style={{ color: '#e5e7eb' }}>{total.toLocaleString()}</strong> rows</>}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ color: '#6b7280', fontSize: 12 }}>Rows/page</label>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
            style={selectStyle}
          >
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <a
            href={exportUrl}
            download="dependabot_filtered.csv"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', background: '#1f2937', border: '1px solid #374151',
              borderRadius: 6, color: '#9ca3af', fontSize: 12, textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            <Download size={13} /> Export CSV
          </a>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid #1f2937', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} style={{ borderBottom: '1px solid #1f2937', background: '#0d1117' }}>
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    style={{
                      padding: '10px 12px', textAlign: 'left',
                      color: '#6b7280', fontWeight: 600, fontSize: 11,
                      letterSpacing: '0.04em', whiteSpace: 'nowrap',
                      width: h.column.columnDef.size,
                    }}
                  >
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
                          backgroundSize: '200% 100%',
                          animation: 'shimmer 1.4s infinite',
                          width: `${40 + Math.random() * 50}%`,
                        }} />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.map(row => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: '1px solid #111827', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#111827')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
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

      {/* Pagination */}
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
          <input
            type="number"
            min={1}
            max={totalPages}
            value={page}
            onChange={e => {
              const v = Number(e.target.value)
              if (v >= 1 && v <= totalPages) setPage(v)
            }}
            style={{ ...selectStyle, width: 60, textAlign: 'center' }}
          />
        </div>
      </div>
    </div>
  )
}

function PagBtn({ onClick, disabled, children }: {
  onClick: () => void; disabled: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '4px 8px', background: disabled ? '#0d1117' : '#1f2937',
        border: '1px solid #374151', borderRadius: 5,
        color: disabled ? '#374151' : '#9ca3af',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center',
      }}
    >
      {children}
    </button>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '4px 8px', background: '#1f2937',
  border: '1px solid #374151', borderRadius: 5,
  color: '#e5e7eb', fontSize: 12, outline: 'none',
}
