import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface AuthState {
  token: string | null
  username: string | null
}

interface AuthContextValue extends AuthState {
  login: (token: string, username: string) => void
  logout: () => void
  isAuthenticated: boolean
}

const TOKEN_KEY = 'ghas_token'
const USER_KEY  = 'ghas_username'

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    token:    localStorage.getItem(TOKEN_KEY),
    username: localStorage.getItem(USER_KEY),
  }))

  const login = useCallback((token: string, username: string) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, username)
    setState({ token, username })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setState({ token: null, username: null })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout, isAuthenticated: !!state.token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Returns the stored token for use in API calls */
export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
