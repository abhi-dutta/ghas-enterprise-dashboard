/**
 * DepsTable — Server-side paginated table for the Dependencies dashboard.
 *
 * Uses TanStack Table with manual (server-side) pagination. Only the current
 * page of rows is fetched from the backend via GET /deps/list. Supports:
 *   - Configurable page size (25/50/100/250)
 *   - First/prev/next/last page navigation + direct page input
 *   - CSV export of filtered results
 *   - Shimmer skeleton loading state
 *   - Auto-resets to page 1 when filters change
 *
 * Columns: Organization, Repository, Package File, Dependency, Open Source.
 */
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { depsApi } from '../../depsApi'
import type { DepsRow, DepsFilters } from '../../depsApi'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download } from 'lucide-react'

const ch = createColumnHelper<DepsRow>()

// ── Badge helpers ─────────────────────────────────────────────────────────

/** Style object for the open-source Yes/No badge (green or red) */
function osBadge(v: string | null) {
  const isOS = v?.toLowerCase() === 'true'
  return {
    color: isOS ? '#4ade80' : '#ef4444',
    background: isOS ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)',
    border: `1px solid ${isOS ? '#4ade80' : '#ef4444'}`,
    borderRadius: 4,
    padding: '1px 7px',
    fontSize: 12,
    fontWeight: 600,
    display: 'inline-block' as const,
  }
}

// ── Column definitions ────────────────────────────────────────────────────
const columns = [
  ch.accessor('org_name', {
    header: 'Organization', size: 160,
    cell: i => <span style={{ color: '#e5e7eb', fontSize: 13 }}>{i.getValue()}</span>,
  }),
  ch.accessor('repo_name', {
    header: 'Repository', size: 180,
    cell: i => <span style={{ color: '#60a5fa', fontSize: 13 }}>{i.getValue()}</span>,
  }),
  ch.accessor('package_name', {
    header: 'Package File', size: 150,
    cell: i => <span style={{ color: '#f59e0b', fontSize: 12, fontFamily: 'monospace' }}>{i.getValue()}</span>,
  }),
  ch.accessor('dependency_name', {
    header: 'Dependency', size: 250,
    cell: i => <span style={{ color: '#e5e7eb', fontSize: 13, fontFamily: 'monospace' }}>{i.getValue()}</span>,
  }),
  ch.accessor('is_open_source', {
    header: 'Open Source', size: 110,
    cell: i => {
      const v = i.getValue()
      if (!v) return <span style={{ color: '#6b7280' }}>—</span>
      return <span style={osBadge(v)}>{v.toLowerCase() === 'true' ? 'Yes' : 'No'}</span>
    },
  }),
]

interface Props { filters: DepsFilters }
/** Available page size options for the rows-per-page dropdown */
const PAGE_SIZES = [25, 50, 100, 250]

export default function DepsTable({ filters }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Serialise filters to detect changes and reset to page 1
  const filtersKey = JSON.stringify(filters)
  useEffect(() => { setPage(1) }, [filtersKey])

  // Fetch the current page of data from the backend
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['deps-list', filtersKey, page, pageSize],
    queryFn: () => depsApi.list(filters, page, pageSize),
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
  const exportUrl = depsApi.exportUrl(filters)

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
          <a href={exportUrl} download="github_dependencies_filtered.csv" style={{
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

// ── Pagination button helper ──────────────────────────────────────────────
/** Small icon button for pagination controls (disabled state handled) */
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

// ── Shared styles ─────────────────────────────────────────────────────────
const selectStyle: React.CSSProperties = {
  padding: '4px 8px', background: '#1f2937', border: '1px solid #374151',
  borderRadius: 5, color: '#9ca3af', fontSize: 12, outline: 'none',
}
