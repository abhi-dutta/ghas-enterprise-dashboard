/**
 * TimelineChart — Vulnerability trend timeline for the Security Overview.
 *
 * Shows how Dependabot and Secret Scanning metrics change over time.
 * Each data point is recorded when a new CSV is ingested (different fingerprint).
 * Data is fetched from GET /timeline and stored persistently in timeline.duckdb.
 *
 * Features:
 *   - Dependabot Total/Open + Secrets Total/Open area/line series
 *   - Toggleable series via legend buttons
 *   - Click-drag zoom on the chart area (select a region to zoom in)
 *   - Brush slider at the bottom for quick range panning
 *   - Reset Zoom button to return to the full view
 */
import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceArea,
} from 'recharts'
import { api } from '../api'
import type { TimelineSnapshot } from '../api'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

// ── Colour constants ──────────────────────────────────────────────────────
const DEP_COLOR      = '#3b82f6'   // blue for Dependabot
const DEP_OPEN_COLOR = '#93c5fd'   // light blue for Dependabot open
const SEC_COLOR      = '#f59e0b'   // amber for Secrets
const SEC_OPEN_COLOR = '#fcd34d'   // light amber for Secrets open
const GRID           = '#1f2937'
const LABEL          = '#6b7280'

/** Merge Dependabot + Secrets snapshots into unified time-series rows */
function mergeTimeline(snapshots: TimelineSnapshot[]): Record<string, any>[] {
  // Group by timestamp (rounded to minute to handle near-simultaneous ingestions)
  const byTime = new Map<string, Record<string, any>>()

  for (const s of snapshots) {
    // Use date portion only for cleaner X-axis labels
    const key = s.timestamp?.slice(0, 16) ?? ''  // YYYY-MM-DDTHH:MM
    if (!byTime.has(key)) {
      byTime.set(key, { timestamp: key })
    }
    const row = byTime.get(key)!
    if (s.source === 'dependabot') {
      row.dep_total    = s.total
      row.dep_open     = s.open
      row.dep_critical = s.critical
    } else if (s.source === 'secrets') {
      row.sec_total  = s.total
      row.sec_open   = s.open
      row.sec_leaked = s.leaked
    }
  }

  return Array.from(byTime.values()).sort((a, b) =>
    (a.timestamp as string).localeCompare(b.timestamp as string)
  )
}

/** Format ISO timestamp for X-axis display */
function fmtDate(ts: string): string {
  if (!ts) return ''
  // Show date only: "Mar 6"
  try {
    const d = new Date(ts)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return ts.slice(0, 10)
  }
}

// ── Series toggle type ────────────────────────────────────────────────────
type SeriesKey = 'dep_total' | 'dep_open' | 'sec_total' | 'sec_open'

const SERIES: { key: SeriesKey; label: string; color: string; dashed?: boolean }[] = [
  { key: 'dep_total',  label: 'Dependabot Total',   color: DEP_COLOR },
  { key: 'dep_open',   label: 'Dependabot Open',    color: DEP_OPEN_COLOR, dashed: true },
  { key: 'sec_total',  label: 'Secrets Total',       color: SEC_COLOR },
  { key: 'sec_open',   label: 'Secrets Open',        color: SEC_OPEN_COLOR, dashed: true },
]

// ── Main component ────────────────────────────────────────────────────────
export default function TimelineChart() {
  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['timeline'],
    queryFn: api.timeline,
  })

  // Track which series are visible
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    dep_total: true, dep_open: true, sec_total: true, sec_open: true,
  })

  // ── Zoom state ────────────────────────────────────────────────────────
  // Stores the index range of the visible data window
  const [zoomLeft, setZoomLeft] = useState<number | null>(null)
  const [zoomRight, setZoomRight] = useState<number | null>(null)

  // Click-drag selection state (indices into the merged array)
  const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null)
  const [refAreaRight, setRefAreaRight] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const toggle = (key: SeriesKey) => {
    setVisible(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Zoom handlers ─────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: any) => {
    if (e?.activeLabel) {
      setRefAreaLeft(e.activeLabel)
      setRefAreaRight(null)
      setIsDragging(true)
    }
  }, [])

  const handleMouseMove = useCallback((e: any) => {
    if (isDragging && e?.activeLabel) {
      setRefAreaRight(e.activeLabel)
    }
  }, [isDragging])

  const handleMouseUp = useCallback((merged: Record<string, any>[]) => {
    if (!refAreaLeft || !refAreaRight) {
      setIsDragging(false)
      setRefAreaLeft(null)
      setRefAreaRight(null)
      return
    }

    // Find the indices in merged data
    let idxLeft = merged.findIndex(d => d.timestamp === refAreaLeft)
    let idxRight = merged.findIndex(d => d.timestamp === refAreaRight)

    if (idxLeft > idxRight) [idxLeft, idxRight] = [idxRight, idxLeft]

    // Only zoom if we selected at least 1 data point range
    if (idxLeft !== idxRight) {
      setZoomLeft(idxLeft)
      setZoomRight(idxRight)
    }

    setRefAreaLeft(null)
    setRefAreaRight(null)
    setIsDragging(false)
  }, [refAreaLeft, refAreaRight])

  const resetZoom = useCallback(() => {
    setZoomLeft(null)
    setZoomRight(null)
  }, [])

  const zoomIn = useCallback((merged: Record<string, any>[]) => {
    const left = zoomLeft ?? 0
    const right = zoomRight ?? merged.length - 1
    const range = right - left
    const step = Math.max(1, Math.floor(range * 0.25))
    setZoomLeft(Math.min(left + step, right - 1))
    setZoomRight(Math.max(right - step, left + 1))
  }, [zoomLeft, zoomRight])

  const zoomOut = useCallback((merged: Record<string, any>[]) => {
    const left = zoomLeft ?? 0
    const right = zoomRight ?? merged.length - 1
    const step = Math.max(1, Math.floor((right - left) * 0.5))
    setZoomLeft(Math.max(0, left - step))
    setZoomRight(Math.min(merged.length - 1, right + step))
  }, [zoomLeft, zoomRight])

  if (isLoading) {
    return (
      <div style={{ color: '#6b7280', fontSize: 13, padding: '20px 0' }}>
        Loading timeline…
      </div>
    )
  }

  if (!snapshots || snapshots.length === 0) {
    return (
      <div style={{
        background: '#111827', border: '1px solid #1f2937', borderRadius: 8,
        padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: 13,
      }}>
        📈 No timeline data yet. Upload new CSV files to start tracking your vulnerability trend over time.
      </div>
    )
  }

  const merged = mergeTimeline(snapshots)
  const isZoomed = zoomLeft !== null && zoomRight !== null

  // Slice the data to the visible zoom window
  const displayData = isZoomed
    ? merged.slice(zoomLeft!, zoomRight! + 1)
    : merged

  return (
    <div style={{
      background: '#111827', border: '1px solid #1f2937', borderRadius: 8,
      padding: '16px 18px',
    }}>
      {/* Header + series toggle + zoom controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e5e7eb' }}>
            📈 Vulnerability Timeline
          </h3>
          {/* Zoom controls */}
          <div style={{ display: 'flex', gap: 3 }}>
            <button onClick={() => zoomIn(merged)} title="Zoom In" style={zoomBtnStyle}>
              <ZoomIn size={13} />
            </button>
            <button onClick={() => zoomOut(merged)} title="Zoom Out" style={zoomBtnStyle}>
              <ZoomOut size={13} />
            </button>
            {isZoomed && (
              <button onClick={resetZoom} title="Reset Zoom" style={{
                ...zoomBtnStyle, color: '#60a5fa', borderColor: '#60a5fa40',
              }}>
                <Maximize2 size={12} /> <span style={{ fontSize: 10 }}>Reset</span>
              </button>
            )}
          </div>
          {isZoomed && (
            <span style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600 }}>
              Zoomed: {fmtDate(displayData[0]?.timestamp)} → {fmtDate(displayData[displayData.length - 1]?.timestamp)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SERIES.map(s => (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
                fontWeight: visible[s.key] ? 700 : 400,
                background: visible[s.key] ? s.color + '20' : '#1f2937',
                color: visible[s.key] ? s.color : '#6b7280',
                border: visible[s.key] ? `1px solid ${s.color}50` : '1px solid #374151',
                transition: 'all 0.15s',
                opacity: visible[s.key] ? 1 : 0.5,
              }}
            >
              <div style={{
                width: 10, height: 3, borderRadius: 2,
                background: s.color,
                borderBottom: s.dashed ? `1px dashed ${s.color}` : 'none',
              }} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drag-to-zoom hint */}
      <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 6, textAlign: 'right' }}>
        💡 Click and drag on the chart to zoom into a time range
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart
          data={displayData}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={() => handleMouseUp(merged)}
          style={{ cursor: isDragging ? 'col-resize' : 'crosshair' }}
        >
          <defs>
            <linearGradient id="gradDepTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={DEP_COLOR} stopOpacity={0.3} />
              <stop offset="95%" stopColor={DEP_COLOR} stopOpacity={0}   />
            </linearGradient>
            <linearGradient id="gradSecTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={SEC_COLOR} stopOpacity={0.3} />
              <stop offset="95%" stopColor={SEC_COLOR} stopOpacity={0}   />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis
            dataKey="timestamp"
            tick={{ fill: LABEL, fontSize: 10 }}
            tickFormatter={fmtDate}
          />
          <YAxis tick={{ fill: LABEL, fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 12 }}
            labelFormatter={fmtDate}
            formatter={(value: number, name: string) => [
              value?.toLocaleString() ?? '—',
              name.replace('dep_', 'Dependabot ').replace('sec_', 'Secrets ').replace('_', ' '),
            ]}
          />

          {/* Dependabot Total (filled area) */}
          {visible.dep_total && (
            <Area
              type="monotone" dataKey="dep_total" name="dep_total"
              stroke={DEP_COLOR} fill="url(#gradDepTotal)"
              strokeWidth={2} dot={{ r: 3, fill: DEP_COLOR }}
              connectNulls
            />
          )}

          {/* Dependabot Open (dashed line) */}
          {visible.dep_open && (
            <Area
              type="monotone" dataKey="dep_open" name="dep_open"
              stroke={DEP_OPEN_COLOR} fill="transparent"
              strokeWidth={2} strokeDasharray="5 3"
              dot={{ r: 2, fill: DEP_OPEN_COLOR }}
              connectNulls
            />
          )}

          {/* Secrets Total (filled area) */}
          {visible.sec_total && (
            <Area
              type="monotone" dataKey="sec_total" name="sec_total"
              stroke={SEC_COLOR} fill="url(#gradSecTotal)"
              strokeWidth={2} dot={{ r: 3, fill: SEC_COLOR }}
              connectNulls
            />
          )}

          {/* Secrets Open (dashed line) */}
          {visible.sec_open && (
            <Area
              type="monotone" dataKey="sec_open" name="sec_open"
              stroke={SEC_OPEN_COLOR} fill="transparent"
              strokeWidth={2} strokeDasharray="5 3"
              dot={{ r: 2, fill: SEC_OPEN_COLOR }}
              connectNulls
            />
          )}

          {/* Click-drag selection highlight */}
          {refAreaLeft && refAreaRight && (
            <ReferenceArea
              x1={refAreaLeft}
              x2={refAreaRight}
              strokeOpacity={0.3}
              fill="#3b82f6"
              fillOpacity={0.15}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {/* Snapshot count info */}
      <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280', textAlign: 'right' }}>
        {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} recorded
        {merged.length > 0 && ` · ${fmtDate(merged[0].timestamp)} → ${fmtDate(merged[merged.length - 1].timestamp)}`}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────
const zoomBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 3,
  padding: '3px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
  background: '#1f2937', color: '#9ca3af',
  border: '1px solid #374151',
  transition: 'all 0.15s',
}
