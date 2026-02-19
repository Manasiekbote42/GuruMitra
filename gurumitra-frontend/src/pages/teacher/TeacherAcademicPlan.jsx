import { useState, useEffect } from 'react';
import Card from '../../components/Card';
import { teacherAcademicPlanGet } from '../../services/api';
import api from '../../services/api';

export default function TeacherAcademicPlan() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingId, setViewingId] = useState(null);

  useEffect(() => {
    setLoading(true);
    teacherAcademicPlanGet()
      .then((d) => setPlans(d.plans || []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  const openPdf = (id) => {
    setViewingId(id);
    api
      .get(`/api/teacher/academic-plan/file/${id}`, { responseType: 'blob' })
      .then((res) => res?.data && window.open(URL.createObjectURL(res.data), '_blank', 'noopener'))
      .catch(() => {})
      .finally(() => setViewingId(null));
  };

  if (loading) {
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
          View academic calendar plans uploaded by your school admin. Select a plan to open or download the PDF.
        </p>
        {plans.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No academic plans have been uploaded yet.</p>
        ) : (
          <ul className="space-y-3">
            {plans.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <span className="font-medium text-gray-800">{p.subject} · {p.class}</span>
                <span className="text-sm text-gray-500">
                  {p.uploadedAt ? new Date(p.uploadedAt).toLocaleString() : ''}
                  {p.uploadedByName ? ` (${p.uploadedByName})` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => openPdf(p.id)}
                  disabled={viewingId === p.id}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                >
                  {viewingId === p.id ? 'Opening…' : 'View PDF'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
