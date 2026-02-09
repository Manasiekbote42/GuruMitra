import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('gurumitra_token') || localStorage.getItem('auth_token');
    const stored = localStorage.getItem('gurumitra_user');
    if (token && stored) {
      try {
        const u = JSON.parse(stored);
        setUser(u);
        // Sync spec keys (auth_token, user_role, user_name) for compatibility
        localStorage.setItem('auth_token', token);
        localStorage.setItem('user_role', u.role || '');
        localStorage.setItem('user_name', u.name || '');
      } catch (_) {
        localStorage.removeItem('gurumitra_token');
        localStorage.removeItem('gurumitra_user');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_name');
      }
    }
    setLoading(false);
  }, []);

  const loginSuccess = (data) => {
    const { token, user: u } = data;
    localStorage.setItem('gurumitra_token', token);
    localStorage.setItem('gurumitra_user', JSON.stringify(u));
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_role', u.role || '');
    localStorage.setItem('user_name', u.name || '');
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('gurumitra_token');
    localStorage.removeItem('gurumitra_user');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_name');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginSuccess, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
