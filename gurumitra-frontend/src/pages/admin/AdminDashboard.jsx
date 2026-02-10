import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card';
import Table from '../../components/Table';
import { adminGetUsers, adminGetActivity, adminGetSystemStatus, adminGetAuditLogs } from '../../services/api';

const STATUS_COLORS = { pending: 'bg-amber-100 text-amber-800', processing: 'bg-blue-100 text-blue-800', completed: 'bg-green-100 text-green-800', failed: 'bg-red-100 text-red-800' };

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);
    Promise.all([
      adminGetUsers().catch(() => []),
      adminGetActivity(20).catch(() => []),
      adminGetSystemStatus().catch((err) => {
        setError(err.response?.data?.error || 'Failed to load system status');
        return null;
      }),
      adminGetAuditLogs(100, 0).catch(() => []),
    ]).then(([u, a, status, logs]) => {
      setUsers(u);
      setActivity(a);
      setSystemStatus(status);
      setAuditLogs(Array.isArray(logs) ? logs : []);
      setLastUpdated(new Date());
      setLoading(false);
      setRefreshing(false);
    });
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => fetchAll(), 5000);
    return () => clearInterval(interval);
  }, []);

  const userColumns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    { key: 'department', label: 'Department', render: (v) => v || '—' },
  ];

  const activityColumns = [
    { key: 'action', label: 'Action' },
    { key: 'actor_email', label: 'Actor' },
    {
      key: 'details',
      label: 'Details',
      render: (v) => {
        if (v == null) return '—';
        const str = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return str.length > 60 ? str.slice(0, 60) + '…' : str;
      },
    },
    { key: 'created_at', label: 'Time', render: (v) => (v ? new Date(v).toLocaleString() : '—') },
  ];

  const recentUploads = systemStatus?.recent_uploads || [];
  const totalUploads = systemStatus?.total_uploads ?? 0;
  const processingCount = systemStatus?.sessions_processing ?? 0;
  const completedCount = systemStatus?.sessions_completed ?? 0;
  const failedCount = systemStatus?.sessions_failed ?? 0;
  const analyzerLastRun = systemStatus?.analyzer_last_run_at;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm" role="alert">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" title="Live" />
          <span className="text-sm text-gray-500">Live updates every 5s</span>
          {lastUpdated && (
            <span className="text-xs text-gray-400">Last: {lastUpdated.toLocaleTimeString()}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => fetchAll(true)}
          disabled={refreshing}
          className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh now'}
        </button>
      </div>

      {/* 1️⃣ User Management */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">1️⃣ User Management</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Card>
            <p className="text-sm text-gray-500">Total Users</p>
            <p className="text-3xl font-bold text-gray-800 mt-1">{users.length}</p>
          </Card>
        </div>
        <Card title="List all users – Add / Edit / Delete &amp; assign roles">
          <p className="text-sm text-gray-600 mb-4">Manage users and roles. Use the User Management page for full CRUD.</p>
          <Table columns={userColumns} data={users} keyField="id" emptyMessage="No users" />
          <Link to="/admin/users" className="inline-block mt-4 text-sm text-primary-600 font-medium hover:text-primary-700">
            Open User Management →
          </Link>
        </Card>
      </section>

      {/* 2️⃣ System Monitoring – from GET /api/admin/system/status */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">2️⃣ System Monitoring</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <p className="text-sm text-gray-500">Total uploads</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{totalUploads}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Processing</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{processingCount}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Completed</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{completedCount}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Failed</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{failedCount}</p>
          </Card>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Analyzer health">
            <p className="text-sm text-gray-600">Last run (session processed)</p>
            <p className="text-lg font-medium text-gray-800 mt-1">
              {analyzerLastRun ? new Date(analyzerLastRun).toLocaleString() : '—'}
            </p>
          </Card>
          <Card title="Recent uploads list">
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {recentUploads.length === 0 ? (
                <li className="text-gray-500 text-sm py-2">No uploads yet.</li>
              ) : (
                recentUploads.slice(0, 15).map((s) => (
                  <li key={s.session_id} className="flex justify-between items-center text-sm py-2 border-b border-gray-100 last:border-0">
                    <span className="text-gray-700">{s.teacher_name || 'Teacher'} · {s.status}</span>
                    <span className="text-gray-500">{new Date(s.created_at).toLocaleString()}</span>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>
        <Card title="Recent uploads (detail)" className="mt-4">
          <Table
            columns={[
              { key: 'teacher_name', label: 'Teacher', render: (v) => v || '—' },
              { key: 'status', label: 'Status', render: (v) => (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[v] || 'bg-gray-100 text-gray-700'}`}>
                  {v || '—'}
                </span>
              )},
              { key: 'created_at', label: 'Time', render: (v) => (v ? new Date(v).toLocaleString() : '—') },
            ]}
            data={recentUploads.slice(0, 10)}
            keyField="session_id"
            emptyMessage="No sessions"
          />
        </Card>
        <Card title="System Activity (Recent)" className="mt-6">
          <Table columns={activityColumns} data={activity} keyField="id" emptyMessage="No activity" />
        </Card>
        <Card title="Audit logs (Phase 5)" className="mt-6">
          <p className="text-sm text-gray-600 mb-4">Video uploads, feedback views, logins, admin actions. Read-only.</p>
          <Table
            columns={[
              { key: 'action', label: 'Action' },
              { key: 'role', label: 'Role' },
              { key: 'actor_email', label: 'Actor', render: (v) => v || '—' },
              { key: 'entity_type', label: 'Entity', render: (v) => v || '—' },
              { key: 'entity_id', label: 'Entity ID', render: (v) => (v ? String(v).slice(0, 8) + '…' : '—') },
              { key: 'created_at', label: 'Time', render: (v) => (v ? new Date(v).toLocaleString() : '—') },
            ]}
            data={auditLogs}
            keyField="id"
            emptyMessage="No audit logs yet"
          />
        </Card>
      </section>
    </div>
  );
}
