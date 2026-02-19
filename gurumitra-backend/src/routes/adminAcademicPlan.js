import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../services/auditLog.js';
import { getPlans, addPlan, getPlanFilePath, ACADEMIC_PLAN_DIR } from '../services/academicPlanStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(path.dirname(__dirname), '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(ACADEMIC_PLAN_DIR)) fs.mkdirSync(ACADEMIC_PLAN_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ACADEMIC_PLAN_DIR),
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.pdf`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.pdf$/i.test(file.originalname) || file.mimetype === 'application/pdf';
    cb(null, !!ok);
  },
});

const router = express.Router();
router.use(authenticate, requireRole('admin'));

/**
 * GET /api/admin/academic-plan - Returns list of all uploaded plans.
 */
router.get('/', (req, res) => {
  const plans = getPlans().map((p) => ({
    ...p,
    url: `/api/admin/academic-plan/file/${p.id}`,
  }));
  res.json({ plans });
});

/**
 * POST /api/admin/academic-plan - Upload a new PDF (multipart: pdf, subject, class).
 */
router.post('/', upload.single('pdf'), (req, res) => {
  try {
    if (!req.file || !req.file.filename) {
      return res.status(400).json({ error: 'PDF file is required' });
    }
    const subject = (req.body.subject || '').trim();
    const planClass = (req.body.class || '').trim();
    if (!subject) return res.status(400).json({ error: 'Subject is required' });
    if (!planClass) return res.status(400).json({ error: 'Class is required' });
    const plan = addPlan(req.file.filename, subject, planClass, req.user?.name || null);
    audit(req.user.id, 'admin', 'academic_plan_uploaded', 'academic_plan', plan.id, req.user.school_id);
    res.status(201).json({
      ...plan,
      url: `/api/admin/academic-plan/file/${plan.id}`,
    });
  } catch (err) {
    console.error('Academic plan upload error:', err);
    res.status(500).json({ error: 'Failed to upload academic plan' });
  }
});

/**
 * GET /api/admin/academic-plan/file/:id - Serve a plan PDF by id.
 */
router.get('/file/:id', (req, res) => {
  const filePath = getPlanFilePath(req.params.id);
  if (!filePath) {
    return res.status(404).json({ error: 'Academic plan not found' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filePath, (err) => {
    if (err) res.status(500).json({ error: 'Error sending file' });
  });
});

export default router;
