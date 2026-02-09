import { useState, useEffect } from 'react';
import Card from '../../components/Card';
import Table from '../../components/Table';
import { adminGetUsers, adminAddUser, adminUpdateRole, adminUpdateUser, adminDeleteUser } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'teacher',
    department: '',
  });
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', department: '', password: '' });
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const load = () => {
    adminGetUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      await adminAddUser(form);
      setShowAdd(false);
      setForm({ name: '', email: '', password: '', role: 'teacher', department: '' });
      load();
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to add user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (userId, role) => {
    try {
      await adminUpdateRole(userId, role);
      load();
    } catch (_) {}
  };

  const openEdit = (row) => {
    setEditingUser(row);
    setEditForm({
      name: row.name,
      email: row.email,
      department: row.department || '',
      password: '',
    });
    setEditError('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditSubmitting(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        department: editForm.department || null,
      };
      if (editForm.password.trim()) payload.password = editForm.password;
      await adminUpdateUser(editingUser.id, payload);
      setEditingUser(null);
      load();
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to update user');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (userId) => {
    setDeleteSubmitting(true);
    try {
      await adminDeleteUser(userId);
      setDeleteConfirmId(null);
      load();
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    { key: 'department', label: 'Department', render: (v) => v || '—' },
    {
      key: 'role',
      label: 'Assign Role',
      render: (_, row) => (
        <select
          value={row.role}
          onChange={(e) => handleRoleChange(row.id, e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1"
        >
          <option value="teacher">Teacher</option>
          <option value="management">Management</option>
          <option value="admin">Admin</option>
        </select>
      ),
    },
    {
      key: 'id',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Edit
          </button>
          {currentUser?.id === row.id ? (
            <span className="text-gray-400 text-xs">(you)</span>
          ) : deleteConfirmId === row.id ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleDelete(row.id)}
                disabled={deleteSubmitting}
                className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
              >
                {deleteSubmitting ? '…' : 'Yes, delete'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleteSubmitting}
                className="text-sm text-gray-600 hover:text-gray-700"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setDeleteConfirmId(row.id)}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card title="User Management">
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            {showAdd ? 'Cancel' : 'Add User'}
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleAdd} className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3">
            {submitError && <div className="text-sm text-red-600">{submitError}</div>}
            <input
              required
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
            />
            <input
              type="password"
              placeholder="Password (optional)"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
            />
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
            >
              <option value="teacher">Teacher</option>
              <option value="management">Management</option>
              <option value="admin">Admin</option>
            </select>
            <input
              placeholder="Department"
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add User'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="animate-pulse h-40 bg-gray-100 rounded" />
        ) : (
          <Table columns={columns} data={users} keyField="id" emptyMessage="No users" />
        )}
      </Card>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !editSubmitting && setEditingUser(null)}>
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Edit user</h3>
            {editError && <div className="text-sm text-red-600 mb-3">{editError}</div>}
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <input
                required
                placeholder="Name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
              />
              <input
                required
                type="email"
                placeholder="Email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
              />
              <input
                placeholder="Department"
                value={editForm.department}
                onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
              />
              <input
                type="password"
                placeholder="New password (leave blank to keep)"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
              />
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 rounded bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
                >
                  {editSubmitting ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  disabled={editSubmitting}
                  className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
