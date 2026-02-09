import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/Card';
import { getMe, teacherUploadSession, teacherUploadSessionFile, teacherGetSessions } from '../../services/api';

const POLL_INTERVAL_MS = 1500;

export default function TeacherUpload() {
  const navigate = useNavigate();
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [gradeClass, setGradeClass] = useState('');
  const [dateOfRecording, setDateOfRecording] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [sessionStatus, setSessionStatus] = useState(null);
  const [sessionError, setSessionError] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return stopPolling;
  }, []);

  // Pre-fill department from current user profile (so it shows if already set by admin or previous upload)
  useEffect(() => {
    getMe()
      .then((user) => {
        if (user?.department && typeof user.department === 'string') setDepartment(user.department);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const urlTrimmed = (videoUrl || '').trim();
    if (!videoFile && !urlTrimmed) {
      setError('Enter a YouTube or video URL, or choose a file to upload.');
      return;
    }
    setLoading(true);
    setSession(null);
    setSessionStatus('processing');
    setSessionError(null);
    const details = {
      video_title: videoTitle.trim() || undefined,
      subject: subject.trim() || undefined,
      grade_class: gradeClass.trim() || undefined,
      date_of_recording: dateOfRecording.trim() || undefined,
      department: department.trim() || undefined,
    };
    try {
      const data = videoFile
        ? await teacherUploadSessionFile(videoFile, details)
        : await teacherUploadSession(urlTrimmed || undefined, details);
      setSession(data);
      setSessionStatus(data.status || 'processing');
      setLoading(false);

      const poll = () => {
        teacherGetSessions()
          .then((sessions) => {
            const current = sessions?.find((s) => s.id === data.id);
            if (current) {
              setSessionStatus(current.status);
              if (current.status === 'failed') setSessionError(current.error_message || 'Analysis failed');
            }
            if (current && (current.status === 'completed' || current.status === 'failed')) {
              stopPolling();
              if (current.status === 'completed') {
                setTimeout(() => navigate('/teacher/dashboard', { state: { sessionCreated: true } }), 1500);
              }
            }
          })
          .catch(() => {});
      };

      poll();
      pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
      setSessionStatus(null);
      setLoading(false);
    }
  };

  const statusSteps = ['Uploaded', 'Processing', sessionStatus === 'completed' ? 'Expert Analysis Complete' : sessionStatus === 'failed' ? 'Expert Analysis Failed' : 'Processing'];
  const currentStep = sessionStatus === 'completed' ? 'Expert Analysis Complete' : sessionStatus === 'failed' ? 'Expert Analysis Failed' : sessionStatus === 'processing' ? 'Processing' : session ? 'Uploaded' : null;

  return (
    <div className="max-w-2xl space-y-6">
      <Card title="Video Details">
        <p className="text-sm text-gray-600 mb-4">Add information about your uploaded video.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
          <div>
            <label htmlFor="video_title" className="block text-sm font-medium text-gray-700 mb-1">
              Video Title
            </label>
            <input
              id="video_title"
              type="text"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder="e.g., Algebra Class - Monday"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Mathematics"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div>
            <label htmlFor="grade_class" className="block text-sm font-medium text-gray-700 mb-1">
              Grade/Class
            </label>
            <input
              id="grade_class"
              type="text"
              value={gradeClass}
              onChange={(e) => setGradeClass(e.target.value)}
              placeholder="e.g., Class 10"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div>
            <label htmlFor="date_of_recording" className="block text-sm font-medium text-gray-700 mb-1">
              Date of Recording
            </label>
            <input
              id="date_of_recording"
              type="text"
              value={dateOfRecording}
              onChange={(e) => setDateOfRecording(e.target.value)}
              placeholder="dd-mm-yyyy"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div>
            <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">
              Department
            </label>
            <input
              id="department"
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g., Mathematics, Science"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">Shown on management dashboard. Update anytime by submitting a new upload with a different department.</p>
          </div>
          <div>
            <label htmlFor="video_url" className="block text-sm font-medium text-gray-700 mb-1">
              YouTube or video URL
            </label>
            <input
              id="video_url"
              type="url"
              value={videoUrl}
              onChange={(e) => { setVideoUrl(e.target.value); setVideoFile(null); }}
              placeholder="https://www.youtube.com/watch?v=... or https://example.com/video.mp4"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              disabled={!!videoFile}
            />
            <p className="mt-1 text-xs text-gray-500">YouTube, youtu.be, or direct .mp4 links supported.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Or upload from device
            </label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setVideoFile(f || null);
                if (f) setVideoUrl('');
              }}
              className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-100 file:text-primary-700 hover:file:bg-primary-200"
            />
            {videoFile && (
              <p className="mt-1 text-sm text-gray-500">Selected: {videoFile.name}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2.5 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Submit for Analysis'}
          </button>
        </form>
      </Card>

      {session && (
        <Card title="Real-time status">
          <div className="flex items-center gap-4 flex-wrap">
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
              sessionStatus === 'completed' ? 'bg-green-100 text-green-800' :
              sessionStatus === 'failed' ? 'bg-red-100 text-red-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              {sessionStatus === 'processing' && '⏳ Expert analysis in progress…'}
              {sessionStatus === 'pending' && '⏳ Queued…'}
              {sessionStatus === 'completed' && '✓ Expert feedback ready'}
              {sessionStatus === 'failed' && '✗ Analysis failed'}
            </span>
          </div>
          <p className="mt-3 text-sm text-gray-500">Session ID: {session.id}</p>
          {sessionStatus === 'processing' && (
            <p className="mt-2 text-sm text-blue-600">Downloading and analyzing your video. This may take a minute for YouTube links.</p>
          )}
          {sessionStatus === 'failed' && sessionError && (
            <p className="mt-2 text-sm text-red-600 bg-red-50 p-3 rounded">Reason: {sessionError}</p>
          )}
          {sessionStatus === 'completed' && (
            <button
              type="button"
              onClick={() => navigate('/teacher/dashboard', { state: { sessionCreated: true } })}
              className="mt-4 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
            >
              View feedback on Dashboard →
            </button>
          )}
        </Card>
      )}
    </div>
  );
}
