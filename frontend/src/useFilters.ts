import { useState, useCallback } from 'react'
import type { Filters } from './api'

export const DEFAULT_FILTERS: Filters = {
  search: '', severity: [], state: [], ecosystem: [], org: [],
}

export function useFilters() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const clear = useCallback(() => setFilters(DEFAULT_FILTERS), [])

  const hasActive = Object.entries(filters).some(([k, v]) =>
    k === 'search' ? v !== '' : (v as string[]).length > 0
  )

  return { filters, set, clear, hasActive }
}
