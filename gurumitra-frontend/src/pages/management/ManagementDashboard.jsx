import { useState, useEffect } from 'react';
import Card from '../../components/Card';
import Table from '../../components/Table';
import {
  managementGetTeachers,
  managementGetTeachersSummary,
  managementGetDepartmentScores,
  managementGetQuarterly,
  managementGetRecentSessions,
  managementGetFeedbackSummary,
} from '../../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function ManagementDashboard() {
  const [teachers, setTeachers] = useState([]);
  const [teachersSummary, setTeachersSummary] = useState([]);
  const [deptScores, setDeptScores] = useState([]);
  const [quarterly, setQuarterly] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [feedbackSummary, setFeedbackSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);
    Promise.all([
      managementGetTeachers().catch(() => []),
      managementGetTeachersSummary(10).catch((err) => {
        setError(err.response?.data?.error || 'Failed to load teachers summary');
        return [];
      }),
      managementGetDepartmentScores().catch(() => []),
      managementGetQuarterly().catch(() => []),
      managementGetRecentSessions(15).catch(() => []),
      managementGetFeedbackSummary().catch(() => []),
    ]).then(([t, sum, d, q, r, f]) => {
      setTeachers(t);
      setTeachersSummary(Array.isArray(sum) ? sum : []);
      setDeptScores(d);
      setQuarterly(q);
      setRecentSessions(r || []);
      setFeedbackSummary(Array.isArray(f) ? f : []);
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

  const deptWithScores = deptScores.filter((r) => r.avg_overall_score != null);
  const avgScore =
    deptWithScores.length > 0
      ? deptWithScores.reduce((a, r) => a + Number(r.avg_overall_score), 0) / deptWithScores.length
      : null;

  const teacherColumns = [
    { key: 'name', label: 'Name' },
    { key: 'department', label: 'Department', render: (v) => v || '—' },
    { key: 'email', label: 'Email' },
    {
      key: 'id',
      label: 'Action',
      render: (_, row) => (
        <button type="button" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
          View report
        </button>
      ),
    },
  ];

  const handleExportPDF = () => {
    // Placeholder: API hook for export
    alert('Export PDF – connect to backend export API');
  };
  const handleExportCSV = () => {
    // Placeholder: client-side CSV from current data
    const headers = ['Name', 'Department', 'Email'];
    const rows = teachers.map((t) => [t.name, t.department || '', t.email].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'teachers-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

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

      {/* 1️⃣ School Onboarding */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">1️⃣ School Onboarding</h2>
        <Card title="School profile &amp; configuration">
          <p className="text-sm text-gray-600 mb-4">
            School profile setup, classroom observation schedule, and assessment criteria. (Configure in settings.)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase">School profile</p>
              <p className="text-sm text-gray-700 mt-1">Not configured</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase">Observation schedule</p>
              <p className="text-sm text-gray-700 mt-1">From settings</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase">Assessment criteria</p>
              <p className="text-sm text-gray-700 mt-1">From video analysis</p>
            </div>
          </div>
        </Card>
      </section>

      {/* 2️⃣ Baseline Assessment */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">2️⃣ Baseline Assessment</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Card>
            <p className="text-sm text-gray-500">Expert-generated benchmark (avg)</p>
            <p className="text-3xl font-bold text-primary-600 mt-1">
              {avgScore != null ? avgScore.toFixed(2) : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">Across all teachers</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Total Teachers</p>
            <p className="text-3xl font-bold text-gray-800 mt-1">{teachers.length}</p>
          </Card>
        </div>
        {/* Department chart: must reflect ALL teachers; backend returns one row per department with teacher_count; null/blank department = "Unassigned". */}
        <Card title="Department-wise overview">
          <p className="text-xs text-gray-500 mb-2">All {teachers.length} teacher{teachers.length !== 1 ? 's' : ''} included. Departments with no score show no bar yet.</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptScores.map((r) => ({ ...r, department: r.department || 'Unassigned', avg_overall_score: r.avg_overall_score != null ? Number(r.avg_overall_score) : null }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="department" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 5]} />
                <Tooltip formatter={(value) => (value != null ? [value.toFixed(2), 'Avg score'] : ['No sessions yet', 'Avg score'])} labelFormatter={(label, payload) => payload[0]?.payload?.teacher_count != null ? `${label} (${payload[0].payload.teacher_count} teacher${payload[0].payload.teacher_count !== 1 ? 's' : ''})` : label} />
                <Bar dataKey="avg_overall_score" fill="#2563eb" radius={[4, 4, 0, 0]} name="Avg score" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      {/* 3️⃣ Continuous Monitoring */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">3️⃣ Continuous Monitoring</h2>
        <Card title="Periodic check-ins &amp; random session analysis">
          <p className="text-sm text-gray-600 mb-4">Recent teacher sessions and Expert processing status.</p>
          <ul className="space-y-2">
            {recentSessions.length === 0 ? (
              <li className="text-gray-500 text-sm py-2">No sessions yet.</li>
            ) : (
              recentSessions.map((s) => (
                <li key={s.id} className="flex justify-between items-center text-sm py-2 border-b border-gray-100 last:border-0">
                  <span className="text-gray-700">
                    <strong>{s.teacher_name}</strong>
                    {s.department && ` (${s.department})`} · <span className="text-green-600">{s.status}</span>
                  </span>
                  <span className="text-gray-500">{new Date(s.created_at).toLocaleString()}</span>
                </li>
              ))
            )}
          </ul>
        </Card>
      </section>

      {/* 4️⃣ Progress Reports – Teacher-wise summary (from API, no recalculation) */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">4️⃣ Progress Reports</h2>
        <Card title="Teacher-wise summary (sessions, averages, growth trend)">
          <p className="text-sm text-gray-600 mb-4">Aggregated from stored session data. Low average flag: overall &lt; 3.0.</p>
          {teachersSummary.length === 0 ? (
            <p className="text-gray-500 text-sm py-2">No teacher summary yet. Teachers need to complete sessions.</p>
          ) : (
            <ul className="space-y-4">
              {teachersSummary.map((row) => (
                <li
                  key={row.teacher_id}
                  className={`p-4 rounded-lg border ${row.low_average_flag ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200 bg-gray-50/50'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-800">{row.teacher_name}</span>
                    {row.department && <span className="text-sm text-gray-500">{row.department}</span>}
                    {row.low_average_flag && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-200 text-amber-900">Low average</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                    <span>Sessions: {row.total_sessions} (completed: {row.completed_sessions})</span>
                    {row.average_scores?.overall != null && (
                      <span className="font-medium text-primary-600">Avg score: {Number(row.average_scores.overall).toFixed(2)}/5</span>
                    )}
                  </div>
                  {row.growth_trend_last_n?.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Growth (last {row.growth_trend_last_n.length}):{' '}
                      {row.growth_trend_last_n.map((t) => t.score != null ? t.score.toFixed(1) : '—').join(' → ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Latest Expert feedback per teacher (from backend)" className="mt-4">
          <p className="text-sm text-gray-600 mb-4">All teachers; latest session score and Expert feedback. Read-only.</p>
          {feedbackSummary.length === 0 ? (
            <p className="text-gray-500 text-sm py-2">No teacher feedback data yet.</p>
          ) : (
            <ul className="space-y-3">
              {feedbackSummary.map((row) => (
                <li key={row.teacher_id} className="p-3 rounded-lg border border-gray-100">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-800">{row.teacher_name}</span>
                    {row.overall_score != null && (
                      <span className="text-sm font-semibold text-primary-600">{Number(row.overall_score).toFixed(1)}/5</span>
                    )}
                  </div>
                  {row.strengths?.length > 0 && (
                    <p className="text-sm text-gray-700 mt-1">Strengths: {row.strengths.slice(0, 2).join('; ')}</p>
                  )}
                  {row.improvements?.length > 0 && (
                    <p className="text-sm text-amber-700 mt-0.5">Improve: {row.improvements.slice(0, 2).join('; ')}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Teacher list" className="mt-4">
          <Table columns={teacherColumns} data={teachers} keyField="id" emptyMessage="No teachers found" />
        </Card>
      </section>

      {/* 5️⃣ Management Analytics Dashboard */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">5️⃣ Management Analytics Dashboard</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="360° performance – Department comparison">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptScores} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="department" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="avg_overall_score" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Growth trajectory – Quarterly">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={quarterly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="quarter" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="avg_overall_score" stroke="#7c3aed" strokeWidth={2} dot name="Avg score" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </section>

      {/* 6️⃣ Exportable Reports */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">6️⃣ Exportable Reports</h2>
        <Card title="Export reports">
          <p className="text-sm text-gray-600 mb-4">Audit-ready &amp; board-ready formats.</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportPDF}
              className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-900"
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Export CSV (teachers)
            </button>
          </div>
        </Card>
      </section>
    </div>
  );
}
