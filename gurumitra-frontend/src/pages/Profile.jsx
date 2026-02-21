import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMe } from '../services/api';
import Card from '../components/Card';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileUser, setProfileUser] = useState(user);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      getMe()
        .then((me) => setProfileUser({ ...user, ...me, department: me.department ?? user.department ?? null }))
        .catch(() => setProfileUser(user))
        .finally(() => setLoading(false));
    } else {
      setProfileUser(user);
      setLoading(false);
    }
  }, [user?.id]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const u = profileUser || user;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card title="Profile">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-2xl font-semibold">
              {u?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">{u?.name}</h2>
              <p className="text-sm text-gray-500">{u?.email}</p>
              <p className="text-xs text-gray-400 capitalize mt-1">{u?.role}</p>
            </div>
          </div>

          {u?.role === 'teacher' && (
            <>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">Department</h3>
                <p className="text-sm text-gray-800">{u?.department?.trim() ? u.department : '—'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">Subject(s) you teach</h3>
                <p className="text-sm text-gray-800">
                  {(u?.subjects || []).length > 0 ? (u.subjects || []).join(', ') : '—'}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">Class(es) you teach to</h3>
                <p className="text-sm text-gray-800">
                  {(u?.classes || []).length > 0 ? (u.classes || []).join(', ') : '—'}
                </p>
              </div>
            </>
          )}

          <div className="pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100"
            >
              Logout
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
