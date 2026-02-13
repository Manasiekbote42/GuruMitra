import { useState, useEffect } from 'react';
import Card from '../../components/Card';
import Table from '../../components/Table';
import {
  adminTrainingLibraryGetList,
  adminTrainingLibraryCreate,
  adminTrainingLibraryUpdate,
  adminTrainingLibraryDelete,
} from '../../services/api';
import api from '../../services/api';

const SUGGESTED_CATEGORIES = [
  { category: 'School Philosophy', sub: ['Vision & Mission', 'Core Values'] },
  { category: 'Employee Handbook', sub: ['Code of Conduct', 'Leave & Attendance Policy', 'Professional Ethics'] },
  {
    category: 'Teaching Methodology',
    sub: ['Generic Interpersonal Skills', 'Classroom Communication', 'Student Engagement', 'Time Management', 'Professional Behaviour'],
  },
];

const SUGGESTED_FLAT = SUGGESTED_CATEGORIES.flatMap(({ category, sub }) =>
  sub.map((sub_category) => ({ category, sub_category }))
);

export default function AdminTrainingLibrary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: '',
    sub_category: '',
    content_type: 'text',
    description: '',
    visible_to: 'both',
    content_text: '',
    file: null,
  });
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', category: '', sub_category: '', description: '', visible_to: 'both', content_text: '', file: null });
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(null);

  const load = () => {
    setLoading(true);
    adminTrainingLibraryGetList()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openPdf = (id) => {
    setPdfLoading(id);
    api
      .get(`/api/training-library/file/${id}`, { responseType: 'blob' })
      .then((res) => res?.data && window.open(URL.createObjectURL(res.data), '_blank', 'noopener'))
      .catch(() => {})
      .finally(() => setPdfLoading(null));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', form.title.trim());
      formData.append('category', form.category.trim());
      formData.append('sub_category', form.sub_category.trim());
      formData.append('content_type', form.content_type);
      formData.append('description', form.description.trim());
      formData.append('visible_to', form.visible_to);
      if (form.content_type === 'text') formData.append('content_text', form.content_text);
      if (form.content_type === 'pdf' && form.file) formData.append('file', form.file);
      await adminTrainingLibraryCreate(formData);
      setShowAdd(false);
      setForm({ title: '', category: '', sub_category: '', content_type: 'text', description: '', visible_to: 'both', content_text: '', file: null });
      load();
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to create item');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (row) => {
    setEditing(row);
    setEditForm({
      title: row.title,
      category: row.category,
      sub_category: row.sub_category,
      description: row.description || '',
      visible_to: row.visible_to || 'both',
      content_text: row.content_text || '',
      file: null,
    });
    setEditError('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', editForm.title.trim());
      formData.append('category', editForm.category.trim());
      formData.append('sub_category', editForm.sub_category.trim());
      formData.append('description', editForm.description.trim());
      formData.append('visible_to', editForm.visible_to);
      formData.append('content_text', editForm.content_text);
      if (editForm.file) formData.append('file', editForm.file);
      await adminTrainingLibraryUpdate(editing.id, formData);
      setEditing(null);
      load();
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to update item');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleteSubmitting(true);
    try {
      await adminTrainingLibraryDelete(id);
      setDeleteConfirmId(null);
      load();
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to delete');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'category', label: 'Category' },
    { key: 'sub_category', label: 'Subcategory' },
    {
      key: 'content_type',
      label: 'Type',
      render: (v) => (v === 'pdf' ? 'PDF' : 'Text'),
    },
    {
      key: 'visible_to',
      label: 'Visible to',
      render: (v) => (v === 'both' ? 'Teacher & Management' : v),
    },
    {
      key: 'id',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-2 flex-wrap">
          {row.content_type === 'pdf' && row.content_url && (
            <button
              type="button"
              onClick={() => openPdf(row.id)}
              disabled={pdfLoading === row.id}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
            >
              {pdfLoading === row.id ? '…' : 'Open'}
            </button>
          )}
          <button type="button" onClick={() => openEdit(row)} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            Edit
          </button>
          {deleteConfirmId === row.id ? (
            <>
              <button
                type="button"
                onClick={() => handleDelete(row.id)}
                disabled={deleteSubmitting}
                className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
              >
                {deleteSubmitting ? '…' : 'Confirm delete'}
              </button>
              <button type="button" onClick={() => setDeleteConfirmId(null)} disabled={deleteSubmitting} className="text-sm text-gray-600">
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setDeleteConfirmId(row.id)} className="text-sm text-red-600 hover:text-red-700 font-medium">
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card title="Training Library">
        <p className="text-sm text-gray-600 mb-4">
          Manage policy and training content. Teachers and management see only items visible to their role.
        </p>
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            {showAdd ? 'Cancel' : 'Add content'}
          </button>
        </div>

        {submitError && <div className="text-sm text-red-600 mb-3">{submitError}</div>}

        {showAdd && (
          <form onSubmit={handleCreate} className="mb-6 p-5 rounded-xl bg-gray-50 border border-gray-200 space-y-4">
            <input
              required
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <input
                  required
                  list="cats"
                  placeholder="e.g. School Philosophy"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
                <datalist id="cats">
                  {[...new Set(SUGGESTED_FLAT.map((c) => c.category))].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Subcategory</label>
                <input
                  required
                  list="subs"
                  placeholder="e.g. Vision & Mission"
                  value={form.sub_category}
                  onChange={(e) => setForm((f) => ({ ...f, sub_category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
                <datalist id="subs">
                  {SUGGESTED_FLAT.map((c) => (
                    <option key={`${c.category}-${c.sub_category}`} value={c.sub_category} />
                  ))}
                </datalist>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Content type</label>
              <select
                value={form.content_type}
                onChange={(e) => setForm((f) => ({ ...f, content_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              >
                <option value="text">Text</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
            {form.content_type === 'pdf' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">PDF file</label>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
                  className="w-full text-sm"
                />
              </div>
            )}
            {form.content_type === 'text' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Text content</label>
                <textarea
                  placeholder="Paste or type content..."
                  value={form.content_text}
                  onChange={(e) => setForm((f) => ({ ...f, content_text: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
              </div>
            )}
            <textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
            />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Visible to</label>
              <select
                value={form.visible_to}
                onChange={(e) => setForm((f) => ({ ...f, visible_to: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              >
                <option value="both">Teacher & Management</option>
                <option value="teacher">Teacher only</option>
                <option value="management">Management only</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add content'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="animate-pulse h-40 bg-gray-100 rounded-lg" />
        ) : (
          <Table columns={columns} data={items} keyField="id" emptyMessage="No training library items yet. Add content above." />
        )}
      </Card>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !editSubmitting && setEditing(null)}
        >
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Edit content</h3>
            {editError && <div className="text-sm text-red-600 mb-3">{editError}</div>}
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <input
                required
                placeholder="Title"
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  placeholder="Category"
                  value={editForm.category}
                  onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
                <input
                  required
                  placeholder="Subcategory"
                  value={editForm.sub_category}
                  onChange={(e) => setEditForm((f) => ({ ...f, sub_category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
              </div>
              <textarea
                placeholder="Description"
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Visible to</label>
                <select
                  value={editForm.visible_to}
                  onChange={(e) => setEditForm((f) => ({ ...f, visible_to: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  <option value="both">Teacher & Management</option>
                  <option value="teacher">Teacher only</option>
                  <option value="management">Management only</option>
                </select>
              </div>
              {editing.content_type === 'text' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Text content</label>
                  <textarea
                    value={editForm.content_text}
                    onChange={(e) => setEditForm((f) => ({ ...f, content_text: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  />
                </div>
              )}
              {editing.content_type === 'pdf' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Replace PDF (optional)</label>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => setEditForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
                    className="w-full text-sm"
                  />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
                >
                  {editSubmitting ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  disabled={editSubmitting}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium"
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
