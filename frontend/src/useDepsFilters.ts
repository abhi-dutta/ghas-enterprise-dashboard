/**
 * React hook for managing Dependencies dashboard filter state.
 *
 * Provides: filters, set(key, value), clear(), hasActive.
 * Mirrors useFilters.ts (Dependabot) and useSecretsFilters.ts (Secrets).
 */
import { useState, useCallback } from 'react'
import type { DepsFilters } from './depsApi'

/** Default (empty) filter state — no filters applied */
export const DEFAULT_DEPS_FILTERS: DepsFilters = {
  search: '', org: [], repo: [], package_file: [], is_open_source: '',
}

export function useDepsFilters() {
  const [filters, setFilters] = useState<DepsFilters>(DEFAULT_DEPS_FILTERS)

  /** Update a single filter key while preserving others */
  const set = useCallback(<K extends keyof DepsFilters>(key: K, value: DepsFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  /** Reset all filters to defaults */
  const clear = useCallback(() => setFilters(DEFAULT_DEPS_FILTERS), [])

  /** True if any filter is active (non-empty search, any selected array, or open-source set) */
  const hasActive = Object.entries(filters).some(([k, v]) =>
    k === 'search' || k === 'is_open_source' ? v !== '' : (v as string[]).length > 0
  )

  return { filters, set, clear, hasActive }
}
