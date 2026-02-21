import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card';
import {
  teacherAcademicPlanGet,
  teacherGetChapters,
  teacherGetChapterProgress,
  teacherGetSessionsForPlan,
  teacherChapterComplete,
  teacherUploadSession,
  teacherUploadSessionFile,
  teacherGetFeedback,
  teacherGetScores,
  teacherGetVideoFeedback,
  teacherDeleteSession,
} from '../../services/api';

export default function TeacherVideoAnalysis() {
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [chapters, setChapters] = useState([]);
  const [progress, setProgress] = useState(null);
  const [sessionsByChapter, setSessionsByChapter] = useState({});
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [uploadingFor, setUploadingFor] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadDate, setUploadDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [openUploadChapter, setOpenUploadChapter] = useState(null);
  const [expandedChapters, setExpandedChapters] = useState({});
  const [pendingCompleteChapter, setPendingCompleteChapter] = useState(null);
  const [completionDate, setCompletionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [analyzingSessionId, setAnalyzingSessionId] = useState(null);
  const [analyzingChapterIndex, setAnalyzingChapterIndex] = useState(null);

  useEffect(() => {
    teacherAcademicPlanGet()
      .then((d) => {
        setPlans(d.plans || []);
        if (d.plans?.length && !selectedPlanId) setSelectedPlanId(d.plans[0].id);
      })
      .catch(() => setPlans([]))
      .finally(() => setLoadingPlans(false));
  }, []);

  useEffect(() => {
    if (!selectedPlanId) {
      setChapters([]);
      setProgress(null);
      setSessionsByChapter({});
      setOpenUploadChapter(null);
      return;
    }
    setLoadingChapters(true);
    Promise.all([
      teacherGetChapters(selectedPlanId),
      teacherGetChapterProgress(selectedPlanId),
    ])
      .then(([ch, prog]) => {
        setChapters(ch.chapters || []);
        setProgress(prog || null);
        const chList = ch.chapters || [];
        const byChapter = {};
        chList.forEach((_, idx) => {
          teacherGetSessionsForPlan(selectedPlanId, idx).then((sessions) => {
            byChapter[idx] = sessions || [];
            setSessionsByChapter((prev) => ({ ...prev, ...byChapter }));
          });
        });
        if (chList.length === 0) setSessionsByChapter({});
        else setExpandedChapters({ 0: true });
      })
      .catch(() => {
        setChapters([]);
        setProgress(null);
      })
      .finally(() => setLoadingChapters(false));
  }, [selectedPlanId]);

  const refreshSessionsForChapter = (chapterIndex) => {
    if (!selectedPlanId) return;
    teacherGetSessionsForPlan(selectedPlanId, chapterIndex).then((sessions) => {
      setSessionsByChapter((prev) => ({ ...prev, [chapterIndex]: sessions || [] }));
    });
  };

  useEffect(() => {
    if (!analyzingSessionId) return;
    const sessionId = analyzingSessionId;
    const chapterIdx = analyzingChapterIndex;
    const interval = setInterval(() => {
      teacherGetVideoFeedback(sessionId)
        .then((data) => {
          if (data.status === 'processing') return;
          setAnalyzingSessionId(null);
          setAnalyzingChapterIndex(null);
          if (chapterIdx != null) refreshSessionsForChapter(chapterIdx);
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(interval);
  }, [analyzingSessionId, analyzingChapterIndex, selectedPlanId]);

  const handleMarkComplete = async (chapterIndex, completed, completedDateValue) => {
    setCompleting(chapterIndex);
    try {
      await teacherChapterComplete(selectedPlanId, chapterIndex, completed, completedDateValue);
      const prog = await teacherGetChapterProgress(selectedPlanId);
      setProgress(prog);
      setPendingCompleteChapter(null);
    } catch (_) {}
    setCompleting(null);
  };

  const handleMarkCompleteClick = (chapterIndex, checked) => {
    if (checked) {
      setPendingCompleteChapter(chapterIndex);
      setCompletionDate(new Date().toISOString().slice(0, 10));
    } else {
      handleMarkComplete(chapterIndex, false);
    }
  };

  const handleSubmitForAnalysis = async (e, chapterIndex) => {
    e.preventDefault();
    const title = (uploadTitle || '').trim();
    if (!title) {
      setUploadError('Video title is required');
      return;
    }
    const url = (uploadUrl || '').trim();
    if (url && !uploadFile) {
      setUploadError('');
      setUploadingFor(chapterIndex);
      try {
        const session = await teacherUploadSession(url, {
          video_title: title,
          academic_plan_id: selectedPlanId,
          chapter_index: chapterIndex,
          date_of_recording: uploadDate || new Date().toISOString().slice(0, 10),
        });
        setUploadUrl('');
        setUploadTitle('');
        setAnalyzingSessionId(session?.id || null);
        setAnalyzingChapterIndex(session?.id ? chapterIndex : null);
        refreshSessionsForChapter(chapterIndex);
      } catch (err) {
        setUploadError(err.response?.data?.error || 'Upload failed');
      }
      setUploadingFor(null);
      return;
    }
    if (uploadFile) {
      setUploadError('');
      setUploadingFor(chapterIndex);
      try {
        const session = await teacherUploadSessionFile(uploadFile, {
          video_title: title,
          academic_plan_id: selectedPlanId,
          chapter_index: chapterIndex,
          date_of_recording: uploadDate || new Date().toISOString().slice(0, 10),
        });
        setUploadFile(null);
        setUploadTitle('');
        setAnalyzingSessionId(session?.id || null);
        setAnalyzingChapterIndex(session?.id ? chapterIndex : null);
        refreshSessionsForChapter(chapterIndex);
      } catch (err) {
        setUploadError(err.response?.data?.error || 'Upload failed');
      }
      setUploadingFor(null);
      return;
    }
    setUploadError('Please paste a video URL or select a video file');
  };

  if (loadingPlans) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!plans.length) {
    return (
      <div className="space-y-6">
        <Card title="Video Analysis">
          <p className="text-gray-600">No academic plans available yet. Your admin needs to upload an academic plan (PDF) first from the Academic Plan section.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card title="Video Analysis">
        <p className="text-sm text-gray-600 mb-4">
          Choose an academic plan below. Chapters from the plan PDF appear here. For each chapter you can upload a video or paste a link to get AI analysis and feedback. Your progress and pacing are shown.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Academic plan</label>
          <select
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            className="w-full max-w-md px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.subject} · {p.class}</option>
            ))}
          </select>
        </div>
        {progress?.paceMessage && (
          <div className="p-3 rounded-lg bg-primary-50 text-primary-800 text-sm mb-4">
            {progress.paceMessage}
          </div>
        )}
        {progress?.paceSuggestions && (
          <div className="p-3 rounded-lg bg-amber-50 text-amber-900 text-sm mb-6">
            <strong>Pacing:</strong> {progress.paceSuggestions}
          </div>
        )}
      </Card>

      {loadingChapters ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600" />
        </div>
      ) : chapters.length === 0 ? (
        <Card title="Chapters">
          <p className="text-gray-600">No chapters could be read from this plan&apos;s PDF. Make sure the PDF contains headings like &quot;Chapter 1&quot;, &quot;1. Title&quot;, or &quot;Unit 1&quot;.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {chapters.map((chapterTitle, chapterIndex) => {
            const sessions = sessionsByChapter[chapterIndex] || [];
            const isCompleted = progress?.completedByChapter?.[chapterIndex]?.completed;
            const isExpanded = expandedChapters[chapterIndex];
            const isAnalyzing = analyzingChapterIndex === chapterIndex;
            return (
              <div key={chapterIndex} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                {/* Chapter header: title (dropdown toggle) + Mark as completed (top right) */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setExpandedChapters((prev) => ({ ...prev, [chapterIndex]: !prev[chapterIndex] }))}
                    className="flex-1 flex items-center gap-2 text-left font-medium text-gray-900 hover:text-primary-700"
                  >
                    <span className="text-primary-600">{isExpanded ? '▼' : '▶'}</span>
                    {chapterTitle || `Chapter ${chapterIndex + 1}`}
                    {sessions.length > 0 && (
                      <span className="text-sm font-normal text-gray-500">({sessions.length} video{sessions.length !== 1 ? 's' : ''})</span>
                    )}
                  </button>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {isCompleted && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 text-sm font-medium">
                        ✓ Completed
                      </span>
                    )}
                    {!isCompleted && pendingCompleteChapter !== chapterIndex && (
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={(e) => handleMarkCompleteClick(chapterIndex, e.target.checked)}
                          disabled={completing === chapterIndex}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">Mark as completed</span>
                      </label>
                    )}
                    {isCompleted && (
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked
                          onChange={(e) => !e.target.checked && handleMarkComplete(chapterIndex, false)}
                          disabled={completing === chapterIndex}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">Mark as completed</span>
                      </label>
                    )}
                    {pendingCompleteChapter === chapterIndex && (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-sm text-gray-700">Completion date:</label>
                        <input
                          type="date"
                          value={completionDate}
                          onChange={(e) => setCompletionDate(e.target.value)}
                          className="px-2 py-1.5 text-sm rounded border border-gray-300"
                        />
                        <button
                          type="button"
                          onClick={() => handleMarkComplete(chapterIndex, true, completionDate)}
                          disabled={completing === chapterIndex}
                          className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingCompleteChapter(null)}
                          className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 space-y-4">
                    {progress?.pacingFeedback?.find((p) => p.chapterIndex === chapterIndex) && (
                      <p className="text-sm text-gray-600">
                        {progress.pacingFeedback.find((p) => p.chapterIndex === chapterIndex).message}
                      </p>
                    )}

                    {/* Videos list with titles */}
                    {sessions.length > 0 ? (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Videos for this chapter</p>
                        <ul className="space-y-2 mb-4">
                          {sessions.map((s) => (
                            <SessionRow
                              key={s.id}
                              session={s}
                              chapterTitle={chapterTitle}
                              onDeleted={() => refreshSessionsForChapter(chapterIndex)}
                            />
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No videos yet. Add a video below and submit for analysis.</p>
                    )}

                    {/* Analysis in progress */}
                    {isAnalyzing && (
                      <div className="p-3 rounded-lg bg-primary-50 border border-primary-200">
                        <p className="text-sm font-medium text-primary-800 mb-2">Analyzing your video…</p>
                        <div className="h-2 bg-primary-200 rounded-full overflow-hidden">
                          <div className="h-full bg-primary-600 rounded-full animate-pulse w-full" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
                        </div>
                        <p className="text-xs text-primary-700 mt-1">Analysis usually takes 1–2 minutes. This will update automatically.</p>
                      </div>
                    )}

                    {/* Upload next / Add another video */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenUploadChapter(openUploadChapter === chapterIndex ? null : chapterIndex)}
                        className="w-full px-3 py-2.5 text-left text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 flex items-center justify-between"
                      >
                        {sessions.length === 0 ? 'Upload video or paste link' : 'Add another video'}
                        <span className="text-primary-600">{openUploadChapter === chapterIndex ? '▼' : '▶'}</span>
                      </button>
                      {openUploadChapter === chapterIndex && (
                        <form onSubmit={(e) => handleSubmitForAnalysis(e, chapterIndex)} className="p-3 bg-gray-50 space-y-4 border-t border-gray-200">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Video title <span className="text-red-600">*</span></label>
                            <input
                              type="text"
                              value={uploadTitle}
                              onChange={(e) => { setUploadTitle(e.target.value); setUploadError(''); }}
                              placeholder="Enter a title for this video (required)"
                              className="w-full px-2 py-1.5 text-sm rounded border border-gray-300"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date of upload / recording</label>
                            <input
                              type="date"
                              value={uploadDate}
                              onChange={(e) => setUploadDate(e.target.value)}
                              className="w-full px-2 py-1.5 text-sm rounded border border-gray-300"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">YouTube or video URL</label>
                            <input
                              type="url"
                              value={uploadUrl}
                              onChange={(e) => { setUploadUrl(e.target.value); setUploadError(''); }}
                              placeholder="https://youtube.com/... or video link"
                              className="w-full px-2 py-1.5 text-sm rounded border border-gray-300"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Or upload from device</label>
                            <input
                              type="file"
                              accept="video/*"
                              onChange={(e) => { setUploadFile(e.target.files?.[0] || null); setUploadError(''); }}
                              className="w-full text-sm text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary-50 file:text-primary-700"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={(!uploadUrl.trim() && !uploadFile) || uploadingFor === chapterIndex}
                            className="w-full px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                          >
                            {uploadingFor === chapterIndex ? 'Submitting…' : 'Submit for analysis'}
                          </button>
                          {uploadError && uploadingFor === chapterIndex && (
                            <p className="text-sm text-red-600" role="alert">{uploadError}</p>
                          )}
                        </form>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SessionRow({ session, chapterTitle, onDeleted }) {
  const [feedback, setFeedback] = useState(null);
  const [scores, setScores] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [videoFeedback, setVideoFeedback] = useState(null);
  const [videoFeedbackLoading, setVideoFeedbackLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadDetail = () => {
    if (feedback !== null) return;
    setLoading(true);
    Promise.all([
      teacherGetFeedback(session.id).catch(() => null),
      teacherGetScores(session.id).catch(() => null),
    ]).then(([f, s]) => {
      setFeedback(f?.status ? null : f);
      setScores(s?.status ? null : s);
    }).finally(() => setLoading(false));
  };

  const loadVideoFeedback = () => {
    if (videoFeedback !== null && videoFeedback.status !== 'processing') return;
    setVideoFeedbackLoading(true);
    teacherGetVideoFeedback(session.id)
      .then((data) => setVideoFeedback(data))
      .catch(() => setVideoFeedback({ status: 'error' }))
      .finally(() => setVideoFeedbackLoading(false));
  };

  const toggleDetail = () => {
    const next = !detailOpen;
    setDetailOpen(next);
    if (next) loadVideoFeedback();
  };

  const handleDelete = () => {
    if (!window.confirm('Delete this video? Feedback and scores will be removed. This cannot be undone.')) return;
    setDeleting(true);
    teacherDeleteSession(session.id)
      .then(() => { if (typeof onDeleted === 'function') onDeleted(); })
      .catch(() => setDeleting(false));
  };

  const rawMeta = session.upload_metadata;
  const meta = typeof rawMeta === 'string' ? (() => { try { return JSON.parse(rawMeta || '{}'); } catch { return {}; } })() : (rawMeta || {});
  const title = (meta.video_title && String(meta.video_title).trim()) || 'Video';
  const uploadDateStr = meta.date_of_recording && String(meta.date_of_recording).trim();
  const dateForDisplay = uploadDateStr && /^\d{4}-\d{2}-\d{2}$/.test(uploadDateStr)
    ? `${uploadDateStr}T00:00:00`
    : (session.uploaded_at || session.created_at);
  const dateStr = dateForDisplay ? new Date(dateForDisplay).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';
  const overall = scores?.overall_score != null ? Number(scores.overall_score).toFixed(1) : (videoFeedback?.score != null ? Number(videoFeedback.score).toFixed(1) : null);

  return (
    <li className="py-3 border-b border-gray-100 last:border-0 space-y-3">
      <div>
        <span className="font-medium text-gray-900">{title}</span>
        <span className="text-sm text-gray-500 ml-2">
          {dateStr} · {session.status}
          {overall != null && ` · Score: ${overall}/5`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/teacher/feedback"
          state={{ selectedSessionId: session.id }}
          className="inline-flex items-center px-3 py-1.5 rounded-lg bg-primary-50 border border-primary-200 text-sm font-medium text-primary-700 hover:bg-primary-100"
          onMouseEnter={loadDetail}
          onClick={loadDetail}
        >
          View feedback
        </Link>
        <button
          type="button"
          onClick={toggleDetail}
          className="inline-flex items-center px-3 py-1.5 rounded-lg bg-primary-50 border border-primary-200 text-sm font-medium text-primary-700 hover:bg-primary-100"
        >
          {detailOpen ? '▼ Hide detailed feedback' : '▶ View detailed feedback'}
        </button>
        {onDeleted && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="ml-auto inline-flex items-center px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            title="Delete this video"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>
      {detailOpen && (
        <div className="mt-3 pl-2 border-l-2 border-primary-200 bg-gray-50 rounded-r p-3 space-y-4">
          {videoFeedbackLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent" />
              Loading feedback…
            </div>
          )}
          {videoFeedback?.status === 'processing' && !videoFeedbackLoading && (
            <p className="text-sm text-blue-600">Analysis in progress. Check back in a few minutes.</p>
          )}
          {videoFeedback?.status === 'failed' && (
            <p className="text-sm text-red-600">
              Analysis failed. {videoFeedback.error_message && <span className="text-gray-700">{videoFeedback.error_message}</span>}
            </p>
          )}
          {videoFeedback && !videoFeedback.status && (
            <VideoFeedbackPanel data={videoFeedback} />
          )}
          {videoFeedback?.status === 'error' && (
            <p className="text-sm text-red-600">Could not load feedback.</p>
          )}
        </div>
      )}
    </li>
  );
}

function VideoFeedbackPanel({ data }) {
  const [enlargedImage, setEnlargedImage] = useState(null);
  const { teaching_feedback, posture_analysis, syllabus_pacing_feedback, strengths, improvements, recommendations, score, posture_feedback, chapter_name } = data;

  return (
    <div className="space-y-4 text-sm">
      {/* 1. Teaching Effectiveness */}
      <section>
        <h4 className="font-semibold text-gray-800 mb-2">1. Teaching effectiveness</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Strengths</p>
            <ul className="list-disc list-inside text-gray-700 space-y-0.5">
              {(strengths || teaching_feedback?.strengths || []).length ? (strengths || teaching_feedback?.strengths || []).map((item, i) => <li key={i}>{item}</li>) : <li className="text-gray-500">None yet</li>}
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
      </section>

      {/* 2. Syllabus progress */}
      <section>
        <h4 className="font-semibold text-gray-800 mb-2">2. Syllabus progress status</h4>
        {chapter_name && <p className="text-gray-700 font-medium">{chapter_name}</p>}
        {syllabus_pacing_feedback ? (
          <>
            <p className="text-gray-700">
              <span className="font-medium">{syllabus_pacing_feedback.chapter_x_of_y}</span>
              {syllabus_pacing_feedback.status && ` · ${syllabus_pacing_feedback.status}`}
            </p>
            <p className="text-gray-600 mt-1">{syllabus_pacing_feedback.message}</p>
          </>
        ) : (
          <p className="text-gray-500">Not linked to a plan, or progress not available.</p>
        )}
      </section>

      {/* 3. Posture & body language */}
      <section>
        <h4 className="font-semibold text-gray-800 mb-2">3. Posture & body language feedback</h4>
        {posture_analysis?.error && (
          <p className="text-amber-700 bg-amber-50 px-2 py-1 rounded">{posture_analysis.error}</p>
        )}
        {posture_analysis && !posture_analysis.error && (
          <>
            <ul className="list-disc list-inside text-gray-700 space-y-0.5">
              {(posture_feedback && posture_feedback.length) ? posture_feedback.map((item, i) => <li key={i}>{item}</li>) : (posture_analysis.feedback && posture_analysis.feedback.length) ? posture_analysis.feedback.map((item, i) => <li key={i}>{item}</li>) : <li className="text-gray-500">No posture issues detected.</li>}
            </ul>
            {posture_analysis.recommendations && posture_analysis.recommendations.length > 0 && (
              <p className="mt-2 text-gray-600">
                <span className="font-medium">Recommendations:</span>{' '}
                {posture_analysis.recommendations.join(' ')}
              </p>
            )}
            {posture_analysis.annotated_images && posture_analysis.annotated_images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {posture_analysis.annotated_images.slice(0, 3).map((img, idx) => {
                  const label = posture_analysis.annotated_image_labels?.[idx];
                  return (
                    <div key={idx} className="flex flex-col">
                      <img src={img} alt={label || 'Posture'} className="w-24 h-24 object-cover rounded border cursor-pointer hover:opacity-90" onClick={() => setEnlargedImage(img)} />
                      {label && <span className="text-xs text-gray-600 max-w-[6rem] truncate" title={label}>{label}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* 4. Suggested improvements */}
      <section>
        <h4 className="font-semibold text-gray-800 mb-2">4. Suggested improvements</h4>
        <ul className="list-disc list-inside text-gray-700 space-y-0.5">
          {(recommendations || teaching_feedback?.recommendations || []).length ? (recommendations || teaching_feedback?.recommendations || []).map((item, i) => <li key={i}>{item}</li>) : <li className="text-gray-500">None</li>}
        </ul>
      </section>

      {enlargedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" onClick={() => setEnlargedImage(null)}>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img src={enlargedImage} alt="Posture" className="max-w-[90vw] max-h-[80vh] rounded shadow-lg border-4 border-white" />
            <button type="button" className="absolute top-2 right-2 bg-white rounded-full p-1 text-gray-700 hover:bg-gray-100" onClick={() => setEnlargedImage(null)} aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
