import { Outlet } from 'react-router-dom';
import { useProtectedRoute } from '../hooks/useProtectedRoute';
import DashboardLayout from '../layouts/DashboardLayout';

export default function ProtectedLayout({ allowedRoles, title }) {
  const redirect = useProtectedRoute(allowedRoles);
  if (redirect) return redirect;
  return <DashboardLayout title={title} />;
}
