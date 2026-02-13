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

  // Modal state for posture images
  const [enlargedImage, setEnlargedImage] = useState(null);

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
            <>
              {feedback.semantic_feedback && (feedback.semantic_feedback.session_summary || (feedback.semantic_feedback.semantic_strengths?.length) || (feedback.semantic_feedback.semantic_improvements?.length)) && (
                <Card title="AI session evaluation">
                  {feedback.semantic_feedback.session_summary && (
                    <p className="text-sm text-gray-700 mb-3">{feedback.semantic_feedback.session_summary}</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Strengths (with evidence)</p>
                      <ul className="space-y-2 text-sm text-gray-700">
                        {(feedback.semantic_feedback.semantic_strengths || []).map((item, i) => (
                          <li key={i} className="flex flex-col">
                            <span>{typeof item === 'object' ? item.point : item}</span>
                            {(typeof item === 'object' && item.evidence) && (
                              <span className="text-xs text-gray-500 mt-0.5" title={item.evidence}>
                                Evidence: {item.evidence}
                              </span>
                            )}
                          </li>
                        ))}
                        {!(feedback.semantic_feedback.semantic_strengths?.length) && <li className="text-gray-500">None</li>}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Areas for improvement (with evidence)</p>
                      <ul className="space-y-2 text-sm text-gray-700">
                        {(feedback.semantic_feedback.semantic_improvements || []).map((item, i) => (
                          <li key={i} className="flex flex-col">
                            <span>{typeof item === 'object' ? item.point : item}</span>
                            {(typeof item === 'object' && item.evidence) && (
                              <span className="text-xs text-gray-500 mt-0.5" title={item.evidence}>
                                Evidence: {item.evidence}
                              </span>
                            )}
                          </li>
                        ))}
                        {!(feedback.semantic_feedback.semantic_improvements?.length) && <li className="text-gray-500">None</li>}
                      </ul>
                    </div>
                  </div>
                  {feedback.semantic_feedback.reasoning_notes && (
                    <p className="text-xs text-gray-600 border-t pt-2 mt-2">Pedagogical notes: {feedback.semantic_feedback.reasoning_notes}</p>
                  )}
                </Card>
              )}
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
              {feedback.posture_analysis && (
                <Card title="Posture Analysis">
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                    {feedback.posture_analysis.feedback && feedback.posture_analysis.feedback.length > 0 ? (
                      feedback.posture_analysis.feedback.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))
                    ) : (
                      <li className="text-gray-500">No posture feedback available.</li>
                    )}
                    {typeof feedback.posture_analysis.slouch_percent === 'number' && (
                      <li>Slouching: {feedback.posture_analysis.slouch_percent.toFixed(1)}%</li>
                    )}
                    {typeof feedback.posture_analysis.shoulder_tension_percent === 'number' && (
                      <li>Shoulder Tension: {feedback.posture_analysis.shoulder_tension_percent.toFixed(1)}%</li>
                    )}
                    {typeof feedback.posture_analysis.avg_spine_angle === 'number' && (
                      <li>Average Spine Angle: {feedback.posture_analysis.avg_spine_angle.toFixed(1)}°</li>
                    )}
                    {typeof feedback.posture_analysis.avg_head_tilt_angle === 'number' && (
                      <li>Head Tilt Angle: {feedback.posture_analysis.avg_head_tilt_angle.toFixed(1)}°</li>
                    )}
                    {typeof feedback.posture_analysis.avg_neck_alignment === 'number' && (
                      <li>Neck Alignment: {feedback.posture_analysis.avg_neck_alignment.toFixed(2)}</li>
                    )}
                    {typeof feedback.posture_analysis.avg_movement === 'number' && (
                      <li>Movement Dynamics: {feedback.posture_analysis.avg_movement.toFixed(2)}</li>
                    )}
                    {typeof feedback.posture_analysis.gesture_count === 'number' && (
                      <li>Gesture Count: {feedback.posture_analysis.gesture_count}</li>
                    )}
                    {typeof feedback.posture_analysis.eye_contact_percent === 'number' && (
                      <li>Eye Contact: {feedback.posture_analysis.eye_contact_percent.toFixed(1)}%</li>
                    )}
                    {typeof feedback.posture_analysis.phone_usage_percent === 'number' && (
                      <li>Phone Usage: {feedback.posture_analysis.phone_usage_percent.toFixed(1)}%</li>
                    )}
                    {typeof feedback.posture_analysis.reading_posture_percent === 'number' && (
                      <li>Reading from materials: {feedback.posture_analysis.reading_posture_percent.toFixed(1)}%</li>
                    )}
                    {typeof feedback.posture_analysis.explaining_posture_percent === 'number' && (
                      <li>Explaining / engaging: {feedback.posture_analysis.explaining_posture_percent.toFixed(1)}%</li>
                    )}
                  </ul>
                  {feedback.posture_analysis.recommendations && feedback.posture_analysis.recommendations.length > 0 && (
                    <div className="mt-4">
                      <p className="font-semibold text-sm text-gray-600">Recommendations:</p>
                      <ul className="list-disc list-inside text-sm text-gray-700">
                        {feedback.posture_analysis.recommendations.map((rec, idx) => (
                          <li key={idx}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {feedback.posture_analysis.annotated_images && feedback.posture_analysis.annotated_images.length > 0 && (
                    <div className="mt-4">
                      <p className="font-semibold text-sm text-gray-600">Posture Issue Snapshots:</p>
                      <div className="flex flex-wrap gap-2">
                        {feedback.posture_analysis.annotated_images.map((img, idx) => (
                          <img
                            key={idx}
                            src={img}
                            alt={`Posture Issue ${idx + 1}`}
                            className="w-32 h-32 object-cover rounded border cursor-pointer hover:scale-105 transition-transform"
                            onClick={() => setEnlargedImage(img)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Heatmap display removed as per user request */}
                </Card>

              )}
              {/* Modal for enlarged posture image */}
              {enlargedImage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" onClick={() => setEnlargedImage(null)}>
                  <div className="relative" onClick={e => e.stopPropagation()}>
                    <img src={enlargedImage} alt="Enlarged Posture" className="max-w-[90vw] max-h-[80vh] rounded shadow-lg border-4 border-white" />
                    <button
                      className="absolute top-2 right-2 bg-white bg-opacity-80 rounded-full p-1 text-gray-700 hover:bg-opacity-100"
                      onClick={() => setEnlargedImage(null)}
                      aria-label="Close"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
