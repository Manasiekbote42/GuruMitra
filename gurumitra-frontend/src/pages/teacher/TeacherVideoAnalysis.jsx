import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card';
import {
  teacherGetMonthlyProgress,
  teacherUploadSession,
  teacherUploadSessionFile,
  teacherGetFeedback,
  teacherGetScores,
  teacherGetVideoFeedback,
  teacherDeleteSession,
} from '../../services/api';

export default function TeacherVideoAnalysis() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDate, setUploadDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [openUpload, setOpenUpload] = useState(false);
  const [analyzingSessionId, setAnalyzingSessionId] = useState(null);

  const loadProgress = () => {
    setLoading(true);
    teacherGetMonthlyProgress(month)
      .then((data) => setProgress(data))
      .catch(() => setProgress(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProgress();
  }, [month]);

  useEffect(() => {
    if (!analyzingSessionId) return;
    const interval = setInterval(() => {
      teacherGetVideoFeedback(analyzingSessionId)
        .then((data) => {
          if (data.status === 'processing') return;
          setAnalyzingSessionId(null);
          loadProgress();
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(interval);
  }, [analyzingSessionId, month]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const title = (uploadTitle || '').trim();
    if (!title) {
      setUploadError('Video title is required');
      return;
    }
    const hasUrl = (uploadUrl || '').trim();
    if (hasUrl && !uploadFile) {
      setUploadError('');
      setUploading(true);
      try {
        const session = await teacherUploadSession(hasUrl, {
          video_title: title,
          date_of_recording: uploadDate || new Date().toISOString().slice(0, 10),
        });
        setUploadUrl('');
        setUploadTitle('');
        setAnalyzingSessionId(session?.id || null);
        loadProgress();
      } catch (err) {
        setUploadError(err.response?.data?.error || 'Upload failed');
      }
      setUploading(false);
      return;
    }
    if (uploadFile) {
      setUploadError('');
      setUploading(true);
      try {
        const session = await teacherUploadSessionFile(uploadFile, {
          video_title: title,
          date_of_recording: uploadDate || new Date().toISOString().slice(0, 10),
        });
        setUploadFile(null);
        setUploadTitle('');
        setAnalyzingSessionId(session?.id || null);
        loadProgress();
      } catch (err) {
        setUploadError(err.response?.data?.error || 'Upload failed');
      }
      setUploading(false);
      return;
    }
    setUploadError('Please paste a video URL or select a video file');
  };

  return (
    <div className="space-y-6">
      <Card title="Video Analysis">
        <p className="text-sm text-gray-600 mb-4">
          Upload a minimum number of videos per month for AI analysis. Your progress is recorded after each video. View feedback and scores below for each submission.
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
        ) : progress ? (
          <>
            <div className={`p-4 rounded-lg mb-6 ${progress.met ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-primary-50 text-primary-800 border border-primary-200'}`}>
              <p className="font-medium">
                {progress.monthLabel}: {progress.count} of {progress.minimum} videos
                {progress.met ? ' — Target met' : ` — ${progress.minimum - progress.count} more to go`}
              </p>
              <p className="text-sm mt-1">{progress.message}</p>
            </div>

            <div className="mb-4">
              <h3 className="text-base font-semibold text-gray-800 mb-2">Videos this month</h3>
              {progress.sessions && progress.sessions.length > 0 ? (
                <ul className="space-y-2">
                  {progress.sessions.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      chapterTitle={null}
                      onDeleted={loadProgress}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No videos uploaded yet this month. Add one below.</p>
              )}
            </div>

            {analyzingSessionId && (
              <div className="p-3 rounded-lg bg-primary-50 border border-primary-200 mb-4">
                <p className="text-sm font-medium text-primary-800">Analyzing your video…</p>
                <div className="h-2 bg-primary-200 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-primary-600 rounded-full animate-pulse w-full" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
                <p className="text-xs text-primary-700 mt-1">Analysis usually takes 1–2 minutes. This will update automatically.</p>
              </div>
            )}

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenUpload(!openUpload)}
                className="w-full px-3 py-2.5 text-left text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 flex items-center justify-between"
              >
                Add video
                <span className="text-primary-600">{openUpload ? '▼' : '▶'}</span>
              </button>
              {openUpload && (
                <form onSubmit={handleSubmit} className="p-3 bg-gray-50 space-y-4 border-t border-gray-200">
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Video title (required)"
                    className="w-full px-2 py-1.5 text-sm rounded border border-gray-300"
                    required
                  />
                  <input
                    type="date"
                    value={uploadDate}
                    onChange={(e) => setUploadDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm rounded border border-gray-300"
                  />
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
                  <div className="text-xs text-gray-500 border-t border-gray-200 pt-2">or</div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Upload from device</label>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => { setUploadFile(e.target.files?.[0] || null); setUploadError(''); }}
                      className="w-full text-sm text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary-50 file:text-primary-700"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={(!(uploadUrl || '').trim() && !uploadFile) || uploading}
                    className="w-full px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                  >
                    {uploading ? 'Submitting…' : 'Submit for analysis'}
                  </button>
                  {uploadError && (
                    <p className="text-sm text-red-600" role="alert">{uploadError}</p>
                  )}
                </form>
              )}
            </div>
          </>
        ) : (
          <p className="text-gray-600">Unable to load progress.</p>
        )}
      </Card>
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
