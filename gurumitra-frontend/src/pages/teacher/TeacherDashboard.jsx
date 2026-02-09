import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Card from '../../components/Card';
import RatingCard from '../../components/RatingCard';
import {
  teacherGetSessions,
  teacherGetLatestSession,
  teacherGetRecommendations,
  teacherGetFeedback,
  teacherGetScores,
} from '../../services/api';
import { usePollSessions } from '../../hooks/usePollSessions';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function isProcessingOrPending(sessions) {
  return (sessions || []).some((s) => s.status === 'processing' || s.status === 'pending');
}

function isRealFeedback(f) {
  return f && f.status !== 'processing' && f.status !== 'failed';
}

function isRealScores(s) {
  return s && s.status !== 'processing' && s.status !== 'failed';
}

export default function TeacherDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [latestSessionPayload, setLatestSessionPayload] = useState(null);
  const [recommendations, setRecommendations] = useState({ modules: [] });
  const [latestFeedback, setLatestFeedback] = useState(null);
  const [latestScores, setLatestScores] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSessionCreated, setShowSessionCreated] = useState(!!location.state?.sessionCreated);

  const fetchRecommendations = useCallback(() => {
    teacherGetRecommendations().then((r) => setRecommendations(r || { modules: [] })).catch(() => setRecommendations({ modules: [] }));
  }, []);

  const fetchLatestFromApi = useCallback(() => {
    teacherGetLatestSession()
      .then(({ session, summary }) => {
        setLatestSessionPayload({ session, summary });
        if (session?.status === 'processing' || session?.status === 'pending') {
          setLatestFeedback({ status: 'processing' });
          setLatestScores({ status: 'processing' });
          return;
        }
        if (session?.status === 'failed') {
          setLatestFeedback({ status: 'failed', error_message: session.error_message });
          setLatestScores({ status: 'failed' });
          return;
        }
        if (summary?.scores) {
          setLatestScores({
            session_id: session?.session_id,
            clarity_score: summary.scores.delivery,
            engagement_score: summary.scores.engagement,
            interaction_score: summary.scores.pedagogy,
            overall_score: summary.scores.curriculum,
            generated_at: session?.created_at,
          });
        } else {
          setLatestScores(null);
        }
        if (summary?.strengths || summary?.improvements || summary?.recommendations || summary?.semantic_feedback) {
          setLatestFeedback({
            session_id: session?.session_id,
            strengths: summary.strengths || [],
            improvements: summary.improvements || [],
            recommendations: summary.recommendations || [],
            semantic_feedback: summary.semantic_feedback || null,
            generated_at: session?.created_at,
          });
        } else if (session && session.status === 'completed') {
          setLatestFeedback({ status: 'processing' });
        } else {
          setLatestFeedback(null);
        }
      })
      .catch(() => {
        setLatestSessionPayload(null);
        setLatestFeedback(null);
        setLatestScores(null);
      });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      teacherGetSessions().catch((err) => {
        setError(err.response?.data?.error || 'Failed to load sessions');
        return [];
      }),
      teacherGetLatestSession().then(({ session, summary }) => {
        setLatestSessionPayload({ session, summary });
        if (session?.status === 'processing' || session?.status === 'pending') {
          setLatestFeedback({ status: 'processing' });
          setLatestScores({ status: 'processing' });
          return;
        }
        if (session?.status === 'failed') {
          setLatestFeedback({ status: 'failed', error_message: session.error_message });
          setLatestScores({ status: 'failed' });
          return;
        }
        if (summary?.scores) {
          setLatestScores({
            session_id: session?.session_id,
            clarity_score: summary.scores.delivery,
            engagement_score: summary.scores.engagement,
            interaction_score: summary.scores.pedagogy,
            overall_score: summary.scores.curriculum,
            generated_at: session?.created_at,
          });
        } else {
          setLatestScores(null);
        }
        if (summary?.strengths || summary?.improvements || summary?.recommendations || summary?.semantic_feedback) {
          setLatestFeedback({
            session_id: session?.session_id,
            strengths: summary.strengths || [],
            improvements: summary.improvements || [],
            recommendations: summary.recommendations || [],
            semantic_feedback: summary.semantic_feedback || null,
            generated_at: session?.created_at,
          });
        } else if (session && session.status === 'completed') {
          setLatestFeedback({ status: 'processing' });
        } else {
          setLatestFeedback(null);
        }
      }).catch(() => {
        setLatestSessionPayload(null);
        setLatestFeedback(null);
        setLatestScores(null);
      }),
    ])
      .then(([s]) => {
        setSessions(Array.isArray(s) ? s : []);
        fetchRecommendations();
      })
      .finally(() => setLoading(false));
  }, [fetchRecommendations]);

  useEffect(() => {
    load();
  }, []);

  usePollSessions(isProcessingOrPending(sessions), (s) => {
    setSessions(s || []);
    const hadProcessing = (sessions || []).some((x) => x.status === 'processing' || x.status === 'pending');
    if (hadProcessing) {
      fetchLatestFromApi();
      fetchRecommendations();
    }
  });

  useEffect(() => {
    if (location.state?.sessionCreated) {
      navigate(location.pathname, { replace: true, state: {} });
      const t = setTimeout(() => setShowSessionCreated(false), 5000);
      return () => clearTimeout(t);
    }
  }, [location.state?.sessionCreated, navigate, location.pathname]);

  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const recentSessions = sessions.slice(0, 5);
  const latestSession = latestSessionPayload?.session || sessions[0];
  const trends = Object.entries(
    completedSessions.reduce((acc, sess) => {
      const m = new Date(sess.created_at).toISOString().slice(0, 7);
      acc[m] = (acc[m] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));
  const chartData = trends.length > 0 ? trends : [{ month: 'N/A', count: 0 }];
  const ratingChartData = isRealScores(latestScores)
    ? [
        { subject: 'Pedagogy', value: Number(latestScores.interaction_score) || 0, fullMark: 5 },
        { subject: 'Engagement', value: Number(latestScores.engagement_score) || 0, fullMark: 5 },
        { subject: 'Delivery', value: Number(latestScores.clarity_score) || 0, fullMark: 5 },
        { subject: 'Curriculum', value: Number(latestScores.overall_score) || 0, fullMark: 5 },
      ]
    : [];

  const benchmarkScore = isRealScores(latestScores) && latestScores.overall_score != null
    ? Number(latestScores.overall_score).toFixed(1)
    : '—';

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
      {showSessionCreated && (
        <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
          Session created successfully. It appears in Baseline Assessment below.
        </div>
      )}

      {/* 1️⃣ Baseline Assessment */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">1️⃣ Baseline Assessment</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <p className="text-sm text-gray-500">Upload &amp; Expert Analysis</p>
            <p className="text-sm text-gray-700 mt-1">
              {latestSession ? `Status: ${latestSession.status}` : 'No session yet'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/teacher/upload')}
              className="mt-3 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
            >
              Upload Video / Create Session
            </button>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Initial Benchmark Score</p>
            <p className="text-2xl font-bold text-primary-600 mt-1">{benchmarkScore}</p>
            <p className="text-xs text-gray-500 mt-1">out of 5 (latest completed session)</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Total Sessions</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{sessions.length}</p>
            <p className="text-xs text-gray-500 mt-1">{completedSessions.length} completed</p>
          </Card>
        </div>
      </section>

      {/* 2️⃣ Receive Rating Profile */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">2️⃣ Receive Rating Profile</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <RatingCard label="Pedagogy" score={isRealScores(latestScores) ? latestScores.interaction_score : null} />
          <RatingCard label="Student Engagement" score={isRealScores(latestScores) ? latestScores.engagement_score : null} />
          <RatingCard label="Teaching Delivery" score={isRealScores(latestScores) ? latestScores.clarity_score : null} />
          <RatingCard label="Curriculum Alignment" score={isRealScores(latestScores) ? latestScores.overall_score : null} />
        </div>
        {latestScores?.status === 'processing' && (
          <p className="text-sm text-blue-600 mb-4">Expert analysis in progress…</p>
        )}
        {ratingChartData.length > 0 && (
          <Card title="Rating overview">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ratingChartData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="subject" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} name="Score" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </section>

      {/* 3️⃣ Personalized Action Plan */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">3️⃣ Personalized Action Plan</h2>
        <Card title="Expert-generated improvement roadmap">
          <p className="text-sm text-gray-600 mb-4">Training modules from your latest Expert feedback. Data from backend only.</p>
          <ul className="space-y-2">
            {(recommendations.modules || []).slice(0, 5).map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm font-medium text-gray-700">{m.title}</span>
                <div className="flex gap-2">
                  <span className="text-xs text-gray-500">{m.duration} · {m.priority}</span>
                  <button type="button" className="text-xs px-2 py-1 rounded bg-primary-100 text-primary-700 hover:bg-primary-200">
                    Start
                  </button>
                </div>
              </li>
            ))}
            {!(recommendations.modules?.length) && (
              <li className="text-gray-500 text-sm py-2">Complete a session to get recommendations from experts.</li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => navigate('/teacher/training')}
            className="mt-4 text-sm text-primary-600 font-medium hover:text-primary-700"
          >
            View all training →
          </button>
        </Card>
      </section>

      {/* 4️⃣ Real-Time Insights */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">4️⃣ Real-Time Insights</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card title="Session feedback snapshot">
            {latestFeedback?.status === 'processing' && (
              <p className="text-sm text-blue-600">Expert analysis in progress…</p>
            )}
            {latestFeedback?.status === 'failed' && (
              <p className="text-sm text-red-600">Expert analysis failed for latest session.</p>
            )}
            {isRealFeedback(latestFeedback) ? (
              <>
                {latestFeedback.semantic_feedback?.session_summary && (
                  <p className="text-sm text-gray-700 mb-2 italic">{latestFeedback.semantic_feedback.session_summary}</p>
                )}
                <p className="text-xs text-gray-500 mb-2">Strengths</p>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 mb-3">
                  {(latestFeedback.strengths || []).slice(0, 2).map((i, k) => (
                    <li key={k}>{i}</li>
                  ))}
                </ul>
                <p className="text-xs text-gray-500 mb-2">Areas to improve</p>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  {(latestFeedback.improvements || []).slice(0, 2).map((i, k) => (
                    <li key={k}>{i}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => navigate('/teacher/feedback')}
                  className="mt-3 text-sm text-primary-600 font-medium hover:text-primary-700"
                >
                  Full feedback →
                </button>
              </>
            ) : !latestFeedback?.status && (
              <p className="text-sm text-gray-500">Upload a session to see Expert-generated suggestions.</p>
            )}
          </Card>
          <Card title="Strong areas">
            {isRealFeedback(latestFeedback) && (latestFeedback.strengths || []).length > 0 ? (
              <ul className="list-disc list-inside text-sm text-green-700 space-y-1">
                {(latestFeedback.strengths || []).slice(0, 3).map((i, k) => (
                  <li key={k}>{i}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">—</p>
            )}
          </Card>
          <Card title="Focus areas">
            {isRealFeedback(latestFeedback) && (latestFeedback.improvements || []).length > 0 ? (
              <ul className="list-disc list-inside text-sm text-amber-700 space-y-1">
                {(latestFeedback.improvements || []).slice(0, 3).map((i, k) => (
                  <li key={k}>{i}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">—</p>
            )}
          </Card>
        </div>
      </section>

      {/* 5️⃣ Self-Reflection Tools */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">5️⃣ Self-Reflection Tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Session playback">
            <p className="text-sm text-gray-600">Links to recorded sessions for self-review.</p>
            {recentSessions.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {recentSessions.slice(0, 3).map((s) => (
                  <li key={s.id}>
                    <span className="text-gray-700">{new Date(s.created_at).toLocaleDateString()}</span>
                    <span className="ml-2 text-gray-500">({s.status})</span>
                    {s.video_url && (
                      <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary-600 hover:underline">
                        Open
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 mt-2">No sessions yet.</p>
            )}
          </Card>
          <Card title="Best practices library">
            <p className="text-sm text-gray-600">Curated resources for teaching excellence.</p>
            <p className="text-sm text-gray-500 mt-2">Coming soon.</p>
          </Card>
          <Card title="Skill-gap tracking">
            <p className="text-sm text-gray-600">Track improvement over time by skill.</p>
            <div className="mt-2 h-24 flex items-center justify-center text-gray-400 text-sm">
              Sessions over time (below)
            </div>
          </Card>
        </div>
      </section>

      {/* 6️⃣ Growth & Recognition */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">6️⃣ Growth &amp; Recognition</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Badges">
            <p className="text-sm text-gray-600">Gamified achievements.</p>
            <div className="mt-2 flex gap-2 flex-wrap">
              {completedSessions.length >= 1 && (
                <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">First upload</span>
              )}
              {completedSessions.length >= 3 && (
                <span className="px-2 py-1 rounded-full bg-primary-100 text-primary-700 text-xs font-medium">3 sessions</span>
              )}
              {completedSessions.length === 0 && <span className="text-sm text-gray-500">Complete sessions to earn badges.</span>}
            </div>
          </Card>
          <Card title="Milestones">
            <p className="text-sm text-gray-600">Growth milestones.</p>
            <p className="text-sm text-gray-500 mt-2">{completedSessions.length} session(s) completed.</p>
          </Card>
          <Card title="Professional development timeline">
            <p className="text-sm text-gray-600">Your PD timeline (completed sessions).</p>
            <div className="mt-2 h-20">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot name="Sessions" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
