import { NavLink } from 'react-router-dom';

const roleLinks = {
  teacher: [
    { to: '/teacher/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/teacher/upload', label: 'Upload Video', icon: '📤' },
    { to: '/teacher/feedback', label: 'Expert Feedback', icon: '💬' },
    { to: '/teacher/training', label: 'Training', icon: '📚' },
  ],
  management: [
    { to: '/management/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/management/teachers', label: 'Teachers', icon: '👥' },
    { to: '/management/departments', label: 'Departments', icon: '🏫' },
  ],
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: '⚙️' },
    { to: '/admin/users', label: 'User Management', icon: '👤' },
    { to: '/admin/activity', label: 'System Activity', icon: '📋' },
  ],
};

export default function Sidebar({ role }) {
  const links = roleLinks[role] || [];

  return (
    <aside className="w-64 min-h-screen bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">GuruMitra</h2>
        <p className="text-xs text-gray-500 capitalize">{role}</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
              }`
            }
          >
            <span>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
