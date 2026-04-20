import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { api } from '../api.js';

const STORAGE_KEY = 'accessToken';

/** @typedef {{ userId: string; role: string; tenantId: string; iat?: number; exp?: number }} JwtUser */

/**
 * @param {string | null | undefined} token
 * @returns {JwtUser | null}
 */
export function parseJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() =>
    localStorage.getItem(STORAGE_KEY),
  );
  const [user, setUser] = useState(() =>
    parseJwtPayload(localStorage.getItem(STORAGE_KEY)),
  );

  const setToken = useCallback((value) => {
    if (value) {
      localStorage.setItem(STORAGE_KEY, value);
      setTokenState(value);
      setUser(parseJwtPayload(value));
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setTokenState(null);
      setUser(null);
    }
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post('/auth/login', { email, password });
      const accessToken = data?.accessToken;
      if (!accessToken || typeof accessToken !== 'string') {
        throw new Error('Missing accessToken in response');
      }
      setToken(accessToken);
      return parseJwtPayload(accessToken);
    },
    [setToken],
  );

  const logout = useCallback(() => {
    setToken(null);
  }, [setToken]);

  const value = useMemo(
    () => ({
      token,
      user,
      login,
      logout,
      isAuthenticated: Boolean(token),
    }),
    [token, user, login, logout],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
