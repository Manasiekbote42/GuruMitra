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
  const [openUploadChapter, setOpenUploadChapter] = useState(null);

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
        else setOpenUploadChapter(0);
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

  const handleMarkComplete = async (chapterIndex, completed) => {
    setCompleting(chapterIndex);
    try {
      await teacherChapterComplete(selectedPlanId, chapterIndex, completed);
      const prog = await teacherGetChapterProgress(selectedPlanId);
      setProgress(prog);
    } catch (_) {}
    setCompleting(null);
  };

  const handleUploadByUrl = async (e, chapterIndex) => {
    e.preventDefault();
    const url = (uploadUrl || '').trim();
    if (!url) {
      setUploadError('Please enter a YouTube or video URL');
      return;
    }
    setUploadError('');
    setUploadingFor(chapterIndex);
    try {
      await teacherUploadSession(url, {
        video_title: uploadTitle.trim() || `Chapter ${chapterIndex + 1} video`,
        academic_plan_id: selectedPlanId,
        chapter_index: chapterIndex,
      });
      setUploadUrl('');
      setUploadTitle('');
      refreshSessionsForChapter(chapterIndex);
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed');
    }
    setUploadingFor(null);
  };

  const handleUploadByFile = async (e, chapterIndex) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please select a video file');
      return;
    }
    setUploadError('');
    setUploadingFor(chapterIndex);
    try {
      await teacherUploadSessionFile(uploadFile, {
        video_title: uploadTitle.trim() || `Chapter ${chapterIndex + 1} video`,
        academic_plan_id: selectedPlanId,
        chapter_index: chapterIndex,
      });
      setUploadFile(null);
      setUploadTitle('');
      refreshSessionsForChapter(chapterIndex);
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed');
    }
    setUploadingFor(null);
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
          <div className="p-3 rounded-lg bg-primary-50 text-primary-800 text-sm mb-6">
            {progress.paceMessage}
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
        chapters.map((chapterTitle, chapterIndex) => {
          const sessions = sessionsByChapter[chapterIndex] || [];
          const isCompleted = progress?.completedByChapter?.[chapterIndex]?.completed;
          return (
            <Card key={chapterIndex} title={chapterTitle || `Chapter ${chapterIndex + 1}`}>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {isCompleted && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 text-sm font-medium" title="Chapter completed">
                    ✓ Completed
                  </span>
                )}
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!isCompleted}
                    onChange={(e) => handleMarkComplete(chapterIndex, e.target.checked)}
                    disabled={completing === chapterIndex}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Mark chapter as completed</span>
                </label>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Videos for this chapter</p>
                {sessions.length === 0 ? (
                  <p className="text-sm text-gray-500 mb-2">No videos yet. Upload a video or paste a link below to get AI analysis and feedback.</p>
                ) : (
                  <ul className="space-y-2">
                    {sessions.map((s) => (
                      <SessionRow key={s.id} session={s} />
                    ))}
                  </ul>
                )}
              </div>

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
                  <div className="p-3 bg-gray-50 space-y-4 border-t border-gray-200">
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="Video title (optional)"
                      className="w-full px-2 py-1.5 text-sm rounded border border-gray-300"
                    />
                    {/* YouTube / URL */}
                    <form onSubmit={(e) => handleUploadByUrl(e, chapterIndex)} className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">YouTube or video URL</label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="url"
                          value={uploadUrl}
                          onChange={(e) => { setUploadUrl(e.target.value); setUploadError(''); }}
                          placeholder="https://youtube.com/... or video link"
                          className="flex-1 min-w-[200px] px-2 py-1.5 text-sm rounded border border-gray-300"
                        />
                        <button
                          type="submit"
                          disabled={!uploadUrl.trim() || uploadingFor === chapterIndex}
                          className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                        >
                          {uploadingFor === chapterIndex ? 'Submitting…' : 'Add by URL'}
                        </button>
                      </div>
                    </form>
                    <div className="text-xs text-gray-500 border-t border-gray-200 pt-2">or</div>
                    {/* Upload file */}
                    <form onSubmit={(e) => handleUploadByFile(e, chapterIndex)} className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Upload from device</label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="file"
                          accept="video/*"
                          onChange={(e) => { setUploadFile(e.target.files?.[0] || null); setUploadError(''); }}
                          className="text-sm text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary-50 file:text-primary-700"
                        />
                        <button
                          type="submit"
                          disabled={!uploadFile || uploadingFor === chapterIndex}
                          className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                        >
                          {uploadingFor === chapterIndex ? 'Uploading…' : 'Upload file'}
                        </button>
                      </div>
                    </form>
                    {uploadError && uploadingFor === chapterIndex && (
                      <p className="text-sm text-red-600">{uploadError}</p>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}

function SessionRow({ session }) {
  const [feedback, setFeedback] = useState(null);
  const [scores, setScores] = useState(null);
  const [loading, setLoading] = useState(false);

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

  const date = session.uploaded_at || session.created_at;
  const overall = scores?.overall_score != null ? Number(scores.overall_score).toFixed(1) : null;

  return (
    <li className="flex flex-wrap items-center gap-2 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">
        {date ? new Date(date).toLocaleString() : '—'} · {session.status}
        {overall != null && ` · Score: ${overall}/5`}
      </span>
      <Link
        to="/teacher/feedback"
        state={{ selectedSessionId: session.id }}
        className="text-sm font-medium text-primary-600 hover:text-primary-700"
        onMouseEnter={loadDetail}
        onClick={loadDetail}
      >
        View feedback
      </Link>
    </li>
  );
}
