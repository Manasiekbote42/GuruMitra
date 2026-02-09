import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedLayout from './components/ProtectedLayout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import TeacherUpload from './pages/teacher/TeacherUpload';
import TeacherFeedback from './pages/teacher/TeacherFeedback';
import TeacherTraining from './pages/teacher/TeacherTraining';
import ManagementDashboard from './pages/management/ManagementDashboard';
import ManagementTeachers from './pages/management/ManagementTeachers';
import ManagementDepartments from './pages/management/ManagementDepartments';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminActivity from './pages/admin/AdminActivity';

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const dash = {
    teacher: '/teacher/dashboard',
    management: '/management/dashboard',
    admin: '/admin/dashboard',
  }[user.role];
  return <Navigate to={dash || '/login'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route path="/teacher" element={<ProtectedLayout allowedRoles={['teacher']} title="Teacher" />}>
        <Route path="dashboard" element={<TeacherDashboard />} />
        <Route path="upload" element={<TeacherUpload />} />
        <Route path="feedback" element={<TeacherFeedback />} />
        <Route path="training" element={<TeacherTraining />} />
      </Route>

      <Route path="/management" element={<ProtectedLayout allowedRoles={['management', 'admin']} title="Management" />}>
        <Route path="dashboard" element={<ManagementDashboard />} />
        <Route path="teachers" element={<ManagementTeachers />} />
        <Route path="departments" element={<ManagementDepartments />} />
      </Route>

      <Route path="/admin" element={<ProtectedLayout allowedRoles={['admin']} title="Admin" />}>
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="activity" element={<AdminActivity />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
