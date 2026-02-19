import { useState, useEffect } from 'react';
import Card from '../../components/Card';
import {
  adminAcademicPlanGet,
  adminAcademicPlanUpload,
} from '../../services/api';
import api from '../../services/api';

const SAMPLE_TEMPLATE_URL = '/sample-academic-calendar-template.pdf';

const SUBJECTS = ['Mathematics', 'English', 'Science', 'Hindi', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'Civics/Government', 'Economics', 'Sociology', 'Anthropology', 'Psychology', 'Computer Science', 'Physical Education', 'Art', 'Music'];
const CLASSES = Array.from({ length: 10 }, (_, i) => `Class ${i + 1}`);

export default function AdminAcademicPlan() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [subject, setSubject] = useState('');
  const [planClass, setPlanClass] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [viewingId, setViewingId] = useState(null);

  const load = () => {
    setLoading(true);
    adminAcademicPlanGet()
      .then((d) => setPlans(d.plans || []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setUploadError('Please select a PDF file');
      return;
    }
    if (!subject.trim()) {
      setUploadError('Please select the subject');
      return;
    }
    if (!planClass) {
      setUploadError('Please select the class');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      await adminAcademicPlanUpload(file, subject.trim(), planClass);
      setFile(null);
      document.getElementById('academic-plan-file-input')?.reset?.();
      load();
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const openPdf = (id) => {
    setViewingId(id);
    api
      .get(`/api/admin/academic-plan/file/${id}`, { responseType: 'blob' })
      .then((res) => res?.data && window.open(URL.createObjectURL(res.data), '_blank', 'noopener'))
      .catch(() => {})
      .finally(() => setViewingId(null));
  };

  if (loading && plans.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card title="Academic Plan">
        <p className="text-sm text-gray-600 mb-6">
          Upload your school&apos;s academic calendar (PDF). Use the sample template below to see the expected format. You can upload multiple plans for different subjects and classes.
        </p>

        {/* Sample template */}
        <div className="mb-8 p-4 rounded-lg bg-gray-50 border border-gray-200">
          <h3 className="text-base font-semibold text-gray-800 mb-2">How to create your calendar</h3>
          <p className="text-sm text-gray-600 mb-3">
            Download and open the sample template to see the recommended structure and format for your academic calendar PDF.
          </p>
          <a
            href={SAMPLE_TEMPLATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition"
          >
            View sample template (PDF)
          </a>
        </div>

        {/* Upload section */}
        <div className="p-4 rounded-lg border border-gray-200">
          <h3 className="text-base font-semibold text-gray-800 mb-3">Upload your academic plan</h3>
          <p className="text-sm text-gray-600 mb-3">Select the subject and class this plan is for, then upload the PDF.</p>
          <form id="academic-plan-file-input" onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="academic-plan-subject" className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <select
                  id="academic-plan-subject"
                  value={subject}
                  onChange={(e) => { setSubject(e.target.value); setUploadError(''); }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select subject</option>
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="academic-plan-class" className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                <select
                  id="academic-plan-class"
                  value={planClass}
                  onChange={(e) => { setPlanClass(e.target.value); setUploadError(''); }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select class</option>
                  {CLASSES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">PDF file</label>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    setUploadError('');
                  }}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
              </div>
              <button
                type="submit"
                disabled={!file || !subject.trim() || !planClass || uploading}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </form>
          {uploadError && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {uploadError}
            </p>
          )}
        </div>

        {/* List of uploaded plans */}
        {plans.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-base font-semibold text-gray-800 mb-3">Uploaded plans</h3>
            <ul className="space-y-2">
              {plans.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className="font-medium text-gray-800">{p.subject} · {p.class}</span>
                  <span className="text-sm text-gray-500">
                    {p.uploadedAt ? new Date(p.uploadedAt).toLocaleString() : ''}
                    {p.uploadedByName ? ` by ${p.uploadedByName}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => openPdf(p.id)}
                    disabled={viewingId === p.id}
                    className="text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
                  >
                    {viewingId === p.id ? 'Opening…' : 'View / download PDF'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
