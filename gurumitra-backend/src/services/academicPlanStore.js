/**
 * Shared storage for academic plans (used by admin and teacher routes).
 * Files: uploads/academic-plan/<id>.pdf
 * Meta: uploads/academic-plan/meta.json { plans: [ { id, subject, class, filename, uploadedAt, uploadedByName } ] }
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(path.dirname(__dirname), '..', 'uploads');
export const ACADEMIC_PLAN_DIR = path.join(UPLOADS_DIR, 'academic-plan');
const META_FILE = path.join(ACADEMIC_PLAN_DIR, 'meta.json');
const LEGACY_FILE_NAME = 'academic-plan.pdf';

function ensureDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(ACADEMIC_PLAN_DIR)) fs.mkdirSync(ACADEMIC_PLAN_DIR, { recursive: true });
}

/**
 * @returns { Array<{ id: string, subject: string, class: string, filename: string, uploadedAt: string, uploadedByName: string | null }> }
 */
export function getPlans() {
  ensureDir();
  const legacyPath = path.join(ACADEMIC_PLAN_DIR, LEGACY_FILE_NAME);
  const hasLegacyFile = fs.existsSync(legacyPath);

  try {
    if (fs.existsSync(META_FILE)) {
      const data = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
      if (Array.isArray(data.plans) && data.plans.length > 0) return data.plans;
      // Legacy single-plan format: meta has uploadedAt (or we have the old PDF file)
      if (hasLegacyFile) {
        const subject = (data && (data.subject ?? data.Subject)) || '';
        const planClass = (data && (data.class ?? data.Class ?? data.planClass)) || '';
        const uploadedAt = (data && (data.uploadedAt ?? data.uploaded_at)) || new Date().toISOString();
        const uploadedByName = (data && (data.uploadedByName ?? data.uploaded_by_name)) || null;
        return [{
          id: 'legacy',
          subject: String(subject),
          class: String(planClass),
          filename: LEGACY_FILE_NAME,
          uploadedAt,
          uploadedByName,
        }];
      }
    }
    // meta.json missing or no plans: still show legacy file if it exists
    if (hasLegacyFile) {
      return [{
        id: 'legacy',
        subject: '',
        class: '',
        filename: LEGACY_FILE_NAME,
        uploadedAt: new Date().toISOString(),
        uploadedByName: null,
      }];
    }
  } catch (_) {}
  return [];
}

/**
 * @param { string } id
 * @returns { string | null } absolute path to file or null
 */
export function getPlanFilePath(id) {
  if (!id || typeof id !== 'string') return null;
  const plans = getPlans();
  const plan = plans.find((p) => p.id === id);
  if (!plan || !plan.filename) return null;
  const filePath = path.join(ACADEMIC_PLAN_DIR, plan.filename);
  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * Add a new plan (file already written as filename).
 * @param { string } filename - filename under ACADEMIC_PLAN_DIR (e.g. uuid.pdf)
 * @param { string } subject
 * @param { string } planClass
 * @param { string } uploadedByName
 * @returns { { id: string, subject: string, class: string, filename: string, uploadedAt: string, uploadedByName: string | null } }
 */
export function addPlan(filename, subject, planClass, uploadedByName) {
  ensureDir();
  const plans = getPlans();
  const id = filename.replace(/\.pdf$/i, '') || randomUUID();
  const uploadedAt = new Date().toISOString();
  const plan = { id, subject, class: planClass, filename, uploadedAt, uploadedByName: uploadedByName || null };
  plans.push(plan);
  fs.writeFileSync(META_FILE, JSON.stringify({ plans }, null, 2));
  return plan;
}

/** Get a single plan by id */
export function getPlanById(planId) {
  const plans = getPlans();
  return plans.find((p) => p.id === planId) || null;
}

/** Update cached chapters for a plan (after PDF parse). */
export function setPlanChapters(planId, chapters) {
  if (!planId || !Array.isArray(chapters)) return;
  ensureDir();
  let data = { plans: [] };
  try {
    if (fs.existsSync(META_FILE)) {
      data = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    }
  } catch (_) {}
  if (!Array.isArray(data.plans) || data.plans.length === 0) {
    data.plans = getPlans();
  }
  const plan = data.plans.find((p) => p.id === planId);
  if (plan) {
    plan.chapters = chapters;
    fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2));
  }
}

/**
 * Remove a plan: delete the PDF file and remove from meta.
 * @param { string } planId
 * @returns { boolean } true if removed, false if plan not found
 */
export function removePlan(planId) {
  const id = (planId != null ? String(planId) : '').trim();
  if (!id) return false;
  ensureDir();
  const plans = getPlans();
  let plan = plans.find((p) => (p.id != null ? String(p.id) : '').trim() === id);
  if (!plan) {
    plan = plans.find((p) => (p.filename != null ? String(p.filename) : '') === id || (p.filename != null ? String(p.filename).replace(/\.pdf$/i, '') : '') === id);
  }
  if (!plan) return false;
  const planIdStored = (plan.id != null ? String(plan.id) : '').trim();
  const filePath = path.join(ACADEMIC_PLAN_DIR, plan.filename || (id.endsWith('.pdf') ? id : `${id}.pdf`));
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Failed to delete academic plan file:', err);
    }
  }
  const updated = plans.filter((p) => (p.id != null ? String(p.id) : '').trim() !== planIdStored);
  let data = { plans: [] };
  try {
    if (fs.existsSync(META_FILE)) {
      data = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    }
  } catch (_) {}
  data.plans = updated;
  fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2));
  return true;
}
