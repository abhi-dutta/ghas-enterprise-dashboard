// Severity / state badge colours (no Tailwind JIT needed)
export const SEV_COLOR: Record<string, string> = {
  critical: '#9b59b6',
  high:     '#e74c3c',
  medium:   '#f39c12',
  low:      '#f1c40f',
}

export const SEV_BG: Record<string, string> = {
  critical: 'rgba(155,89,182,0.18)',
  high:     'rgba(231,76,60,0.18)',
  medium:   'rgba(243,156,18,0.18)',
  low:      'rgba(241,196,15,0.18)',
}

export function severityBadge(s: string) {
  const color = SEV_COLOR[s?.toLowerCase()] ?? '#6b7280'
  const bg    = SEV_BG[s?.toLowerCase()]   ?? 'rgba(107,114,128,0.15)'
  return { color, background: bg, border: `1px solid ${color}`, borderRadius: 4,
           padding: '1px 7px', fontSize: 12, fontWeight: 600, display: 'inline-block' }
}

export function stateBadge(s: string) {
  const map: Record<string, { color: string; bg: string }> = {
    open:          { color: '#4ade80', bg: 'rgba(74,222,128,0.15)' },
    fixed:         { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
    dismissed:     { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' },
    auto_dismissed:{ color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' },
  }
  const { color, bg } = map[s?.toLowerCase()] ?? { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' }
  return { color, background: bg, border: `1px solid ${color}`, borderRadius: 4,
           padding: '1px 7px', fontSize: 12, fontWeight: 600, display: 'inline-block' }
}
