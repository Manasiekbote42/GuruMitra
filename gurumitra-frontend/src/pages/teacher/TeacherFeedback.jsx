import { useState, useEffect } from 'react';
import Card from '../../components/Card';
import { teacherGetSessions, teacherGetFeedback, teacherGetScores } from '../../services/api';

export default function TeacherFeedback() {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [scores, setScores] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    teacherGetSessions()
      .then((s) => {
        setSessions(s);
        if (s?.length) setSelectedId(s[0].id);
      })
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setFeedback(null);
      setScores(null);
      return;
    }
    setDetailLoading(true);
    Promise.all([
      teacherGetFeedback(selectedId).catch(() => ({ status: 'error' })),
      teacherGetScores(selectedId).catch(() => ({ status: 'error' })),
    ])
      .then(([f, s]) => {
        setFeedback(f?.status === 'processing' || f?.status === 'failed' ? { status: f.status, error_message: f.error_message } : f);
        setScores(s?.status === 'processing' || s?.status === 'failed' ? { status: s.status, error_message: s.error_message } : s);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  return (
    <div className="space-y-6">
      <Card title="Expert Feedback">
        <p className="text-sm text-gray-600 mb-4">
          Select a session to view teaching clarity, engagement, interaction scores and textual Expert feedback.
        </p>
        {loading ? (
          <div className="animate-pulse h-20 bg-gray-100 rounded" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  selectedId === s.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {new Date(s.created_at).toLocaleDateString()} · {s.status}
              </button>
            ))}
            {!sessions.length && (
              <p className="text-gray-500 text-sm">No sessions yet. Upload a video first.</p>
            )}
          </div>
        )}
      </Card>

      {selectedId && (
        <>
          {(feedback?.status === 'processing' || scores?.status === 'processing') && (
            <p className="text-sm text-blue-600 mb-4">Expert analysis in progress. Data will appear when ready.</p>
          )}
          {(feedback?.status === 'failed' || scores?.status === 'failed') && (
            <p className="text-sm text-red-600 mb-4">
              Expert analysis failed for this session.
              {(feedback?.error_message || scores?.error_message) && (
                <span className="block mt-1 text-gray-700 font-normal">Reason: {feedback?.error_message || scores?.error_message}</span>
              )}
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['clarity_score', 'engagement_score', 'interaction_score', 'overall_score'].map((key) => (
              <Card key={key}>
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  {key.replace('_score', '').replace('_', ' ')}
                </p>
                <p className="text-2xl font-bold text-primary-600 mt-1">
                  {detailLoading ? '—' : (scores?.status ? '—' : (scores?.[key] ?? '—'))}
                </p>
              </Card>
            ))}
          </div>

          {feedback && !feedback.status && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card title="Strengths">
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                  {(feedback.strengths || []).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                  {!(feedback.strengths?.length) && <li className="text-gray-500">None yet</li>}
                </ul>
              </Card>
              <Card title="Improvements">
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                  {(feedback.improvements || []).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                  {!(feedback.improvements?.length) && <li className="text-gray-500">None yet</li>}
                </ul>
              </Card>
              <Card title="Recommendations">
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                  {(feedback.recommendations || []).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                  {!(feedback.recommendations?.length) && <li className="text-gray-500">None yet</li>}
                </ul>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
