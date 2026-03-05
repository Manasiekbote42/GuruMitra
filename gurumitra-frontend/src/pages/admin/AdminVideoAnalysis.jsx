import { useState, useEffect } from 'react';
import Card from '../../components/Card';
import { adminGetMonthlyProgress, adminGetSessionFeedback } from '../../services/api';

export default function AdminVideoAnalysis() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminGetMonthlyProgress(month)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [month]);

  return (
    <div className="space-y-6">
      <Card title="Video Analysis Progress">
        <p className="text-sm text-gray-600 mb-4">
          View teachers&apos; monthly video upload progress and minimum target. Click a video to see full analysis and feedback.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600" />
          </div>
        ) : data ? (
          <>
            <p className="text-sm text-gray-600 mb-4">
              <strong>{data.monthLabel}</strong> — Minimum required: {data.minimum} videos per teacher
            </p>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-800">Teacher</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-800">Email</th>
                    <th className="px-4 py-2 text-center text-sm font-semibold text-gray-800">Videos</th>
                    <th className="px-4 py-2 text-center text-sm font-semibold text-gray-800">Target</th>
                    <th className="px-4 py-2 text-center text-sm font-semibold text-gray-800">Status</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-800">Videos / Feedback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.teachers && data.teachers.length > 0 ? (
                    data.teachers.map((t) => (
                      <TeacherRow key={t.id} teacher={t} />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-gray-500">No teachers found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-gray-600">Unable to load progress.</p>
        )}
      </Card>
    </div>
  );
}

function TeacherRow({ teacher }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-2 text-sm font-medium text-gray-900">{teacher.name}</td>
        <td className="px-4 py-2 text-sm text-gray-600">{teacher.email}</td>
        <td className="px-4 py-2 text-sm text-center">{teacher.count}</td>
        <td className="px-4 py-2 text-sm text-center">{teacher.minimum}</td>
        <td className="px-4 py-2 text-center">
          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${teacher.met ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
            {teacher.met ? 'Met' : 'Not met'}
          </span>
        </td>
        <td className="px-4 py-2">
          {teacher.sessions && teacher.sessions.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              {expanded ? 'Hide' : 'Show'} {teacher.sessions.length} video(s)
            </button>
          ) : (
            <span className="text-sm text-gray-500">—</span>
          )}
        </td>
      </tr>
      {expanded && teacher.sessions && teacher.sessions.length > 0 && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-gray-50">
            <ul className="space-y-2">
              {teacher.sessions.map((s) => (
                <SessionFeedbackCell key={s.id} session={s} teacherName={teacher.name} />
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

function SessionFeedbackCell({ session, teacherName }) {
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const rawMeta = session.upload_metadata;
  const meta = typeof rawMeta === 'string' ? (() => { try { return JSON.parse(rawMeta || '{}'); } catch { return {}; } })() : (rawMeta || {});
  const title = (meta.video_title && String(meta.video_title).trim()) || 'Video';
  const dateStr = session.created_at ? new Date(session.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

  const loadFeedback = () => {
    if (feedback !== null && feedback.status !== 'processing') return;
    setLoading(true);
    adminGetSessionFeedback(session.id)
      .then(setFeedback)
      .catch(() => setFeedback({ status: 'error' }))
      .finally(() => setLoading(false));
  };

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadFeedback();
  };

  return (
    <li className="flex flex-wrap items-center gap-2 py-2 border-b border-gray-100 last:border-0">
      <span className="font-medium text-gray-800">{title}</span>
      <span className="text-sm text-gray-500">{dateStr}</span>
      <span className="text-xs text-gray-500">· {session.status}</span>
      <button
        type="button"
        onClick={handleToggle}
        className="text-sm font-medium text-primary-600 hover:text-primary-700"
      >
        {open ? 'Hide feedback' : 'View feedback'}
      </button>
      {open && (
        <div className="w-full mt-2 pl-4 border-l-2 border-primary-200 bg-white rounded-r p-3 text-sm">
          {loading && (
            <div className="flex items-center gap-2 text-gray-600">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent" />
              Loading…
            </div>
          )}
          {feedback?.status === 'processing' && !loading && (
            <p className="text-blue-600">Analysis in progress.</p>
          )}
          {feedback?.status === 'failed' && (
            <p className="text-red-600">Analysis failed. {feedback.error_message && <span className="text-gray-700">{feedback.error_message}</span>}</p>
          )}
          {feedback && !feedback.status && feedback.status !== 'processing' && (
            <AdminFeedbackPanel data={feedback} teacherName={teacherName} />
          )}
          {feedback?.status === 'error' && (
            <p className="text-red-600">Could not load feedback.</p>
          )}
        </div>
      )}
    </li>
  );
}

function AdminFeedbackPanel({ data, teacherName }) {
  const { strengths, improvements, recommendations, score, teaching_feedback, syllabus_pacing_feedback, posture_feedback, posture_analysis } = data;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs font-medium text-gray-500">Teacher: {teacherName}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Strengths</p>
          <ul className="list-disc list-inside text-gray-700 space-y-0.5">
            {(strengths || teaching_feedback?.strengths || []).length ? (strengths || teaching_feedback?.strengths || []).map((item, i) => <li key={i}>{item}</li>) : <li className="text-gray-500">None</li>}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Improvements</p>
          <ul className="list-disc list-inside text-gray-700 space-y-0.5">
            {(improvements || teaching_feedback?.improvements || []).length ? (improvements || teaching_feedback?.improvements || []).map((item, i) => <li key={i}>{item}</li>) : <li className="text-gray-500">None</li>}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Score</p>
          <p className="text-lg font-bold text-primary-600">{score != null ? `${Number(score).toFixed(1)}/5` : '—'}</p>
        </div>
      </div>
      {syllabus_pacing_feedback && (
        <p className="text-gray-600">{syllabus_pacing_feedback.message}</p>
      )}
      {posture_analysis && !posture_analysis.error && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Posture feedback</p>
          <ul className="list-disc list-inside text-gray-700 space-y-0.5">
            {(posture_feedback && posture_feedback.length) ? posture_feedback.map((item, i) => <li key={i}>{item}</li>) : (posture_analysis.feedback || []).map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}
      {(recommendations || teaching_feedback?.recommendations || []).length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Recommendations</p>
          <ul className="list-disc list-inside text-gray-700 space-y-0.5">
            {(recommendations || teaching_feedback?.recommendations || []).map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
