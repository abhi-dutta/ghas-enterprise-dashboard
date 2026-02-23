import { useState, useCallback } from 'react'
import type { SecretsFilters } from './secretsApi'

export const DEFAULT_SECRETS_FILTERS: SecretsFilters = {
  search: '', secret_type: [], state: [], validity: [], org: [],
}

export function useSecretsFilters() {
  const [filters, setFilters] = useState<SecretsFilters>(DEFAULT_SECRETS_FILTERS)

  const set = useCallback(<K extends keyof SecretsFilters>(key: K, value: SecretsFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const clear = useCallback(() => setFilters(DEFAULT_SECRETS_FILTERS), [])

  const hasActive = Object.entries(filters).some(([k, v]) =>
    k === 'search' ? v !== '' : (v as string[]).length > 0
  )

  return { filters, set, clear, hasActive }
}
