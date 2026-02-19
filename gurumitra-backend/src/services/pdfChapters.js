/**
 * Extract chapter-like headings from a PDF file (for Video Analysis).
 * Uses pdf-parse to get text, then regex to find "Chapter N", "1. Title", etc.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch (_) {
  pdfParse = null;
}

/**
 * Extract text from PDF buffer (uses pdf-parse if available).
 * @param { string } filePath - absolute path to PDF
 * @returns { Promise<string> } raw text
 */
async function extractPdfText(filePath) {
  if (!pdfParse || !fs.existsSync(filePath)) return '';
  const dataBuffer = fs.readFileSync(filePath);
  try {
    const data = await pdfParse(dataBuffer);
    return (data && data.text) ? String(data.text) : '';
  } catch (_) {
    return '';
  }
}

// Header words to skip (table headers, not chapter names)
const SKIP_WORDS = /^(Chapter\s*No\.?|Chapter\s*Name|Planned\s*Start|Planned\s*End|Duration|Days?|Science\s*Chapter\s*Planning)$/i;
const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
// Table row: "1 Chemical Reactions and Equations 01 Jun 2026 08 Jun 2026 8"
const TABLE_ROW_RE = new RegExp(`^\\s*(\\d+)\\s+(.+?)\\s+\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}`, 'i');

// Holiday lines: "Aug 2026 Independence Day", "Oct 2026 Gandhi Jayanti" (Month Year EventName) – not chapters
const HOLIDAY_LINE_RE = new RegExp(`^(?:${MONTHS})\\s+\\d{4}\\s+.+`, 'i');

function isHeaderOrDateLine(name) {
  const t = (name || '').trim();
  if (!t || t.length > 200) return true;
  if (SKIP_WORDS.test(t)) return true;
  // Skip if it looks like a date range (e.g. "01 Jun 2026 08 Jun 2026")
  if (/^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i.test(t)) return true;
  return false;
}

/** True if this is a holiday line (e.g. "Aug 2026 Independence Day"), not a chapter. */
export function isHolidayLine(name) {
  const t = (name || '').trim();
  if (!t) return false;
  if (HOLIDAY_LINE_RE.test(t)) return true;
  return false;
}

/**
 * Find chapter-like lines in text.
 * Priority 1: Planning table rows: "1 Chapter Name 01 Jun 2026 08 Jun 2026 8" (number + name + date).
 * Priority 2: Other patterns (Chapter 1, 1. Title, Unit 1, etc.).
 * Excludes header rows and date-only lines so holidays are not treated as chapters.
 * @param { string } text
 * @returns { string[] } array of chapter titles (order preserved)
 */
function findChapters(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set();
  const chapters = [];

  // 1) Planning table format: "1 Chemical Reactions and Equations 01 Jun 2026 08 Jun 2026 8"
  for (const line of lines) {
    const m = line.match(TABLE_ROW_RE);
    if (m) {
      const num = m[1];
      const name = (m[2] || '').trim();
      if (isHeaderOrDateLine(name) || isHolidayLine(name)) continue;
      const key = `${num}-${name.slice(0, 60)}`;
      if (!seen.has(key)) {
        seen.add(key);
        chapters.push(name);
      }
    }
  }

  // 1b) Same pattern on full text (in case PDF splits table across lines)
  if (chapters.length === 0 && text.length > 20) {
    const fullText = text.replace(/\r?\n/g, ' ');
    const globalRe = new RegExp(TABLE_ROW_RE.source, 'gi');
    let match;
    while ((match = globalRe.exec(fullText)) !== null) {
      const num = match[1];
      const name = (match[2] || '').trim();
      if (isHeaderOrDateLine(name) || isHolidayLine(name)) continue;
      const key = `${num}-${name.slice(0, 60)}`;
      if (!seen.has(key)) {
        seen.add(key);
        chapters.push(name);
      }
    }
  }

  if (chapters.length > 0) return chapters;

  // 2) Other common patterns
  const patterns = [
    /^Chapter\s+(\d+)[.:\s-]*(.*)$/i,
    /^Ch\.?\s*(\d+)[.:\s-]*(.*)$/i,
    /^Unit\s+(\d+)[.:\s-]*(.*)$/i,
    /^Lesson\s+(\d+)[.:\s-]*(.*)$/i,
    /^Topic\s+(\d+)[.:\s-]*(.*)$/i,
    /^Part\s+(\d+)[.:\s-]*(.*)$/i,
    /^(\d+)[.)\-\s:]\s*(.+)$/,
    /^(\d+)[.)\-\s:]\s*$/,
    /^(\d+)\s+([A-Za-z].+)$/,
    /^(\d+)\s*$/,
  ];

  for (const line of lines) {
    for (const re of patterns) {
      const m = line.match(re);
      if (m) {
        const num = m[1];
        const title = (m[2] != null ? m[2] : '').trim() || `Chapter ${num}`;
        if (title.length > 200 || isHeaderOrDateLine(title) || isHolidayLine(title)) continue;
        const key = `${num}-${title.slice(0, 50)}`;
        if (!seen.has(key)) {
          seen.add(key);
          chapters.push(title);
        }
        break;
      }
    }
  }

  // 3) Fallback: number + rest of line (short) – exclude holidays e.g. "15 Aug 2026 Independence Day"
  if (chapters.length === 0 && lines.length > 0) {
    for (const line of lines) {
      const withNum = line.match(/^(\d+)\s+(.+)$/);
      if (withNum) {
        const num = withNum[1];
        const rest = (withNum[2] || '').trim();
        if (rest.length <= 150 && !isHeaderOrDateLine(rest) && !isHolidayLine(rest) && !seen.has(num)) {
          seen.add(num);
          chapters.push(rest || `Chapter ${num}`);
        }
      }
    }
  }

  return chapters;
}

/**
 * @param { string } filePath - absolute path to PDF
 * @returns { Promise<string[]> } chapter titles (never empty: fallback to single "Syllabus / Plan" if none found)
 */
export async function extractChaptersFromPdf(filePath) {
  const text = await extractPdfText(filePath);
  let chapters = findChapters(text);
  // If PDF had no detectable headings, allow teacher to still use one section
  if (chapters.length === 0) {
    chapters = ['Syllabus / Plan'];
  }
  return chapters;
}
