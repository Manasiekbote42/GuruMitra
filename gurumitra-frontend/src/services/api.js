import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gurumitra_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('gurumitra_token');
      localStorage.removeItem('gurumitra_user');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_name');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const login = (email, password) =>
  api.post('/api/auth/login', { email, password }).then((r) => r.data);

export const signup = (data) =>
  api.post('/api/auth/signup', data).then((r) => r.data);

export const forgotPassword = (email) =>
  api.post('/api/auth/forgot-password', { email }).then((r) => r.data);

export const resetPassword = (token, newPassword, confirmPassword) =>
  api.post('/api/auth/reset-password', { token, newPassword, confirmPassword }).then((r) => r.data);

export const getMe = () => api.get('/api/auth/me').then((r) => r.data);

/** Create session from URL. Optional: video_title, subject, grade_class, date_of_recording, department (saves to teacher profile). */
export const teacherUploadSession = (videoUrl, details = {}) =>
  api
    .post('/api/teacher/sessions', {
      video_url: videoUrl,
      video_title: details.video_title,
      subject: details.subject,
      grade_class: details.grade_class,
      date_of_recording: details.date_of_recording,
      department: details.department,
    })
    .then((r) => r.data);

/** Upload a video file from device (multipart). Optional details: video_title, subject, grade_class, date_of_recording, department (saves to teacher profile). */
export const teacherUploadSessionFile = (file, details = {}) => {
  const form = new FormData();
  form.append('video', file);
  if (details.video_title != null) form.append('video_title', details.video_title);
  if (details.subject != null) form.append('subject', details.subject);
  if (details.grade_class != null) form.append('grade_class', details.grade_class);
  if (details.date_of_recording != null) form.append('date_of_recording', details.date_of_recording);
  if (details.department != null) form.append('department', details.department);
  return api
    .post('/api/teacher/sessions/upload', form, { headers: { 'Content-Type': undefined } })
    .then((r) => r.data);
};

export const teacherGetSessions = () => api.get('/api/teacher/sessions').then((r) => r.data);

/** Latest session + summary (scores, strengths, improvements from analysis_result). */
export const teacherGetLatestSession = () => api.get('/api/teacher/sessions/latest').then((r) => r.data);

export const teacherGetFeedback = (sessionId) =>
  api.get(`/api/teacher/sessions/${sessionId}/feedback`).then((r) => r.data);

export const teacherGetScores = (sessionId) =>
  api.get(`/api/teacher/sessions/${sessionId}/scores`).then((r) => r.data);

export const teacherGetRecommendations = () =>
  api.get('/api/teacher/recommendations').then((r) => r.data);

/** Phase 4: Rule-based training recommendations from latest session analysis (question_count, example_count, structure_score, interaction_score). */
export const getTrainingRecommendations = (teacherId) =>
  api.get(`/api/training/recommendations/${teacherId}`).then((r) => r.data);

export const managementGetRecentSessions = (limit = 20) =>
  api.get('/api/management/recent-sessions', { params: { limit } }).then((r) => r.data);

export const managementGetTeachers = () => api.get('/api/management/teachers').then((r) => r.data);

/** Teacher-wise average scores, session counts, growth trend (last N), low-average flag. */
export const managementGetTeachersSummary = (lastSessions = 10) =>
  api.get('/api/management/teachers/summary', { params: { last_sessions: lastSessions } }).then((r) => r.data);

export const managementGetFeedbackSummary = () =>
  api.get('/api/management/teachers/feedback-summary').then((r) => r.data);

export const managementGetDepartmentScores = () =>
  api.get('/api/management/scores/department').then((r) => r.data);

export const managementGetQuarterly = () =>
  api.get('/api/management/scores/quarterly').then((r) => r.data);

export const managementGetTrends = (year) =>
  api.get('/api/management/scores/trends', year ? { params: { year } } : {}).then((r) => r.data);

export const adminGetUsers = (role) =>
  api.get('/api/admin/users', role ? { params: { role } } : {}).then((r) => r.data);

export const adminAddUser = (data) => api.post('/api/admin/users', data).then((r) => r.data);

export const adminUpdateRole = (userId, role) =>
  api.patch(`/api/admin/users/${userId}/role`, { role }).then((r) => r.data);

export const adminUpdateUser = (userId, data) =>
  api.put(`/api/admin/users/${userId}`, data).then((r) => r.data);

export const adminDeleteUser = (userId) =>
  api.delete(`/api/admin/users/${userId}`).then((r) => r.data);

export const adminGetActivity = (limit = 50) =>
  api.get('/api/admin/activity', { params: { limit } }).then((r) => r.data);

/** Recent uploads / processing queue: use management recent-sessions for admin view */
export const adminGetRecentSessions = (limit = 30) =>
  api.get('/api/management/recent-sessions', { params: { limit } }).then((r) => r.data);

/** System status: total uploads, processing/completed/failed, analyzer last run, recent uploads. */
export const adminGetSystemStatus = () => api.get('/api/admin/system/status').then((r) => r.data);

/** Phase 5: Audit logs (admin only). */
export const adminGetAuditLogs = (limit = 100, offset = 0, action = '') =>
  api.get('/api/admin/audit-logs', { params: { limit, offset, action: action || undefined } }).then((r) => r.data);

/** Phase 5: List schools for assignment. */
export const adminGetSchools = () => api.get('/api/admin/schools').then((r) => r.data);

export default api;
