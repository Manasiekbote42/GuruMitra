import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Navbar({ title = 'Dashboard' }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">
          {user?.name}
          <span className="ml-2 text-gray-400">({user?.role})</span>
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm text-gray-600 hover:text-primary-600 font-medium"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
