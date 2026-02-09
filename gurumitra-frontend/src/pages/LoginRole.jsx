import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login } from '../services/api';

const roleRedirect = {
  teacher: '/teacher/dashboard',
  management: '/management/dashboard',
  admin: '/admin/dashboard',
};

const ROLE_CONFIG = {
  teacher: {
    title: 'Teacher Portal',
    subtitle: 'Sign in to upload classroom sessions and view your Expert feedback',
    icon: '📚',
    accent: 'primary',
    gradient: 'from-blue-50 to-indigo-100',
    borderAccent: 'border-l-blue-500',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    ringClass: 'focus:ring-blue-500',
    placeholder: 'teacher@school.edu',
  },
  management: {
    title: 'School Management',
    subtitle: 'Sign in to view teacher performance, reports, and analytics',
    icon: '🏫',
    accent: 'emerald',
    gradient: 'from-emerald-50 to-teal-100',
    borderAccent: 'border-l-emerald-500',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
    ringClass: 'focus:ring-emerald-500',
    placeholder: 'principal@school.edu',
  },
  admin: {
    title: 'Administrator',
    subtitle: 'Sign in to manage users, roles, and system monitoring',
    icon: '⚙️',
    accent: 'violet',
    gradient: 'from-violet-50 to-purple-100',
    borderAccent: 'border-l-violet-500',
    buttonClass: 'bg-violet-600 hover:bg-violet-700 focus:ring-violet-500',
    ringClass: 'focus:ring-violet-500',
    placeholder: 'admin@gurumitra.edu',
  },
};

export default function LoginRole() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathRole = location.pathname.replace(/^\/login\/?/, '').replace(/\/$/, '') || 'teacher';
  const role = ROLE_CONFIG[pathRole] ? pathRole : 'teacher';
  const config = ROLE_CONFIG[role];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginSuccess } = useAuth();
  const from = location.state?.from?.pathname;

  useEffect(() => {
    if (!ROLE_CONFIG[pathRole]) {
      navigate('/login', { replace: true });
    }
  }, [pathRole, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email.trim(), password);
      loginSuccess(data);
      const to = roleRedirect[data.user.role] || '/';
      navigate(from || to, { replace: true });
    } catch (err) {
      if (!err.response) {
        setError('Cannot reach server. Is the backend running at http://localhost:3001?');
      } else {
        const msg = err.response?.data?.error || `Login failed (${err.response?.status || 'error'}). Check email and password.`;
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br ${config.gradient} px-4`}>
      <div className="w-full max-w-md">
        <div className={`bg-white rounded-2xl shadow-xl border border-gray-100 p-8 border-l-4 ${config.borderAccent}`}>
          <div className="text-center mb-8">
            <span className="text-4xl block mb-2">{config.icon}</span>
            <h1 className="text-2xl font-bold text-gray-800">{config.title}</h1>
            <p className="text-gray-500 mt-1 text-sm">{config.subtitle}</p>
            <p className="text-xs text-gray-400 mt-2 uppercase tracking-wide">GuruMitra</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={`w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-offset-0 outline-none transition ${config.ringClass}`}
                placeholder={config.placeholder}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-offset-0 outline-none transition ${config.ringClass}`}
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 rounded-lg text-white font-medium focus:ring-2 focus:ring-offset-2 disabled:opacity-50 transition ${config.buttonClass}`}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-gray-500">
            <Link to="/login" className="text-gray-400 hover:text-gray-600">Not {role}? Choose another portal</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
