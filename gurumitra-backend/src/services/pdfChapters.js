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

// Header/metadata to never treat as chapter names
const SKIP_WORDS = /^(Chapter\s*No\.?|Chapter\s*Name|Planned\s*Start|Planned\s*End|Duration|Days?|Science\s*Chapter\s*Planning|Subject|Academic\s*Year|Holidays?|Date|Holiday\s*Name|Holiday\s*Date|2026-2027|Independence\s*Day|Gandhi\s*Jayanti)$/i;
const SKIP_CONTAINS = /^(Subject\s*:|Academic\s*Year\s*:|\d{4}-\d{4})/i;
const MONTHS_ABBREV = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
const MONTHS_FULL = 'January|February|March|April|May|June|July|August|September|October|November|December';
const MONTHS = `${MONTHS_ABBREV}|${MONTHS_FULL}`;
// Table row (line): "1 Chemical Reactions and Equations 01 Jun 2026 08 Jun 2026 8" (supports Jun or June etc.)
const TABLE_ROW_RE = new RegExp(`^\\s*(\\d+)\\s+(.+?)\\s+\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}`, 'i');
// Full table row (anywhere in text): number + name + "DD Mon YYYY DD Mon YYYY" + optional " duration"
const TABLE_ROW_FULL_RE = new RegExp(
  `(\\d+)\\s+([\\s\\S]+?)\\s+\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}\\s+\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}(?:\\s+\\d+)?`,
  'gi'
);
// One date only (e.g. "1 Chapter Name 01 Jun 2026" or "1 Chapter Name 01-Jun-2026")
const TABLE_ROW_ONE_DATE_RE = new RegExp(
  `(\\d+)\\s+([\\s\\S]+?)\\s+\\d{1,2}[\\s/-](?:${MONTHS})[\\s/-]\\d{4}(?:\\s|$)`,
  'gi'
);
// Number + title only (no date): "1 Chemical Reactions and Equations" – title starts with letter, 2–120 chars
const NUMBER_TITLE_RE = new RegExp(
  `(\\d+)\\s+([A-Za-z][A-Za-z0-9\\s,'&()-]{2,120}?)(?=\\s+\\d+\\s|[.)]\\s*\\d|\\s*Chapter\\s+\\d|\\s*Unit\\s+\\d|$)`,
  'g'
);

// Holiday lines: "Aug 2026 Independence Day", "15 Aug 2026Independence Day", "02 Oct 2026Gandhi Jayanti"
const HOLIDAY_LINE_RE = new RegExp(`^(?:${MONTHS})\\s+\\d{4}\\s*.+`, 'i');
const HOLIDAY_DATE_LINE_RE = new RegExp(`^\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}\\s*.+`, 'i');

function isHeaderOrDateLine(name) {
  const t = (name || '').trim();
  if (!t || t.length > 200) return true;
  if (SKIP_WORDS.test(t)) return true;
  if (SKIP_CONTAINS.test(t)) return true;
  // Skip if it looks like a date range (e.g. "01 Jun 2026 08 Jun 2026")
  if (/^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s+\d{4}/i.test(t)) return true;
  return false;
}

/** True if this is a holiday line (e.g. "Aug 2026 Independence Day", "15 Aug 2026Independence Day"), not a chapter. */
export function isHolidayLine(name) {
  const t = (name || '').trim();
  if (!t) return false;
  if (HOLIDAY_LINE_RE.test(t)) return true;
  if (HOLIDAY_DATE_LINE_RE.test(t)) return true;
  return false;
}

// Any chapter title containing these (anywhere) is metadata/holiday, not a real chapter
const METADATA_HOLIDAY_CONTAINS = /Subject\s*:|Academic\s*Year|Holidays?|Holiday\s*Name|Independence\s*Day|Gandhi\s*Jayanti|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i;

/** True if this should not appear as a chapter (holiday or metadata like Subject, Academic Year, Holidays). */
export function isMetadataOrHolidayLine(name) {
  const t = (name || '').trim();
  if (!t) return true;
  if (isHolidayLine(name)) return true;
  if (SKIP_WORDS.test(t)) return true;
  if (SKIP_CONTAINS.test(t)) return true;
  if (METADATA_HOLIDAY_CONTAINS.test(t)) return true;
  return false;
}

/**
 * Extract only the "Science Chapter Planning" (or chapter planning) section from full PDF text,
 * so we never parse holidays or metadata. Stops at "Holidays" / "Holiday" section.
 * @param { string } text - full PDF text
 * @returns { string } section containing only the chapter planning table, or full text if no section found
 */
function extractChapterPlanningSection(text) {
  if (!text || typeof text !== 'string') return '';
  const normalized = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
  // First: cut at Holidays so we never include holiday rows
  const holidaysMatch = normalized.match(/\bholidays?\b|holiday\s*name|holiday\s*date/i);
  const beforeHolidays = holidaysMatch && holidaysMatch.index !== undefined
    ? normalized.slice(0, holidaysMatch.index).trim()
    : normalized;
  // Find start: "Science Chapter Planning", "Chapter Planning", table header "Chapter No", or "Syllabus"
  let start = -1;
  const startPatterns = [
    /science\s+chapter\s+planning/i,
    /chapter\s+planning/i,
    /chapter\s*no\.?/i,
    /\bsyllabus\b/i
  ];
  for (const re of startPatterns) {
    const match = beforeHolidays.match(re);
    if (match && match.index !== undefined) {
      start = match.index;
      break;
    }
  }
  if (start === -1) return beforeHolidays;
  return beforeHolidays.slice(start).trim();
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

  // 1b) Full-document scan: match "number + name + DD Mon YYYY DD Mon YYYY [duration]" anywhere
  if (chapters.length === 0 && text.length > 20) {
    const fullDocChapters = [];
    let match;
    TABLE_ROW_FULL_RE.lastIndex = 0;
    while ((match = TABLE_ROW_FULL_RE.exec(text)) !== null) {
      const num = parseInt(match[1], 10);
      const name = (match[2] || '').replace(/\s+/g, ' ').trim();
      if (!name || isHeaderOrDateLine(name) || isHolidayLine(name)) continue;
      const key = `${num}-${name.slice(0, 60)}`;
      if (!seen.has(key)) {
        seen.add(key);
        fullDocChapters.push({ num, name });
      }
    }
    if (fullDocChapters.length > 0) {
      fullDocChapters.sort((a, b) => a.num - b.num);
      return fullDocChapters.map((c) => c.name);
    }
    // 1c) One date only: "1 Chapter Name 01 Jun 2026" or "1 Chapter Name 01-Jun-2026"
    const oneDateChapters = [];
    TABLE_ROW_ONE_DATE_RE.lastIndex = 0;
    while ((match = TABLE_ROW_ONE_DATE_RE.exec(text)) !== null) {
      const num = parseInt(match[1], 10);
      const name = (match[2] || '').replace(/\s+/g, ' ').trim();
      if (!name || name.length < 3 || isHeaderOrDateLine(name) || isHolidayLine(name)) continue;
      const key = `${num}-${name.slice(0, 60)}`;
      if (!seen.has(key)) {
        seen.add(key);
        oneDateChapters.push({ num, name });
      }
    }
    if (oneDateChapters.length > 0) {
      oneDateChapters.sort((a, b) => a.num - b.num);
      return oneDateChapters.map((c) => c.name);
    }
  }

  if (chapters.length > 0) return chapters;

  // 1d) Number + title only (no date) in full text: "1 Chemical Reactions and Equations"
  if (chapters.length === 0 && text.length > 10) {
    const fullText = text.replace(/\r?\n/g, ' ');
    const numberTitleChapters = [];
    let match;
    NUMBER_TITLE_RE.lastIndex = 0;
    while ((match = NUMBER_TITLE_RE.exec(fullText)) !== null) {
      const num = parseInt(match[1], 10);
      const name = (match[2] || '').replace(/\s+/g, ' ').trim();
      if (!name || name.length < 3 || isHeaderOrDateLine(name) || isHolidayLine(name)) continue;
      if (seen.has(`${num}-${name.slice(0, 50)}`)) continue;
      numberTitleChapters.push({ num, name });
    }
    if (numberTitleChapters.length > 0) {
      const byNum = new Map();
      numberTitleChapters.forEach(({ num, name }) => {
        const existing = byNum.get(num);
        if (!existing || name.length > existing.length) byNum.set(num, name);
      });
      const sorted = [...byNum.entries()].sort((a, b) => a[0] - b[0]);
      return sorted.map(([, name]) => name);
    }
  }

  if (chapters.length > 0) return chapters;

  // 2) Full-text scan for "Chapter N", "Unit N", "N. Title" (PDF may split across lines)
  const fullText = text.replace(/\r?\n/g, ' ');
  const fullDocList = [];
  const fullTextPatterns = [
    /\bChapter\s+(\d+)[.:\s-]*([^0-9]{0,120}?)(?=\s*Chapter\s+\d+|\s*Unit\s+\d+|\s*\d+[.)]\s|$)/gi,
    /\bUnit\s+(\d+)[.:\s-]*([^0-9]{0,120}?)(?=\s*Chapter\s+\d+|\s*Unit\s+\d+|\s*\d+[.)]\s|$)/gi,
    /\b(\d+)[.)]\s+([A-Za-z][^0-9]{0,120}?)(?=\s*\d+[.)]\s|\s*Chapter\s+|\s*Unit\s+|$)/g,
  ];
  const byNum = new Map();
  for (const re of fullTextPatterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(fullText)) !== null) {
      const num = parseInt(m[1], 10);
      let title = (m[2] != null ? m[2] : '').replace(/\s+/g, ' ').trim().slice(0, 150);
      if (!title || title.length < 2) title = re.source.includes('Chapter') || re.source.includes('Unit') ? `Chapter ${num}` : null;
      if (!title || isHeaderOrDateLine(title) || isHolidayLine(title)) continue;
      const existing = byNum.get(num);
      if (!existing || title.length > existing.length) byNum.set(num, title);
    }
  }
  if (byNum.size > 0) {
    const sorted = [...byNum.entries()].sort((a, b) => a[0] - b[0]);
    return sorted.map(([, name]) => name);
  }

  // 3) Line-based common patterns
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

  // 4) Fallback: number + rest of line (short) – exclude holidays e.g. "15 Aug 2026 Independence Day"
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

  // 5) Number on one line, title on next (PDF table with one cell per line)
  if (chapters.length === 0 && lines.length >= 2) {
    const paired = [];
    for (let i = 0; i < lines.length - 1; i++) {
      const numMatch = lines[i].match(/^(\d+)$/);
      if (!numMatch) continue;
      const num = parseInt(numMatch[1], 10);
      if (num < 1 || num > 999) continue;
      const nextLine = (lines[i + 1] || '').trim();
      if (nextLine.length < 3 || nextLine.length > 150) continue;
      if (isHeaderOrDateLine(nextLine) || isHolidayLine(nextLine)) continue;
      if (/^\d+$/.test(nextLine)) continue;
      if (/^[A-Za-z]/.test(nextLine)) {
        const key = `${num}-${nextLine.slice(0, 50)}`;
        if (!seen.has(key)) {
          seen.add(key);
          paired.push({ num, name: nextLine });
        }
      }
    }
    if (paired.length > 0) {
      paired.sort((a, b) => a.num - b.num);
      return paired.map((c) => c.name);
    }
  }

  return chapters;
}

/**
 * @param { string } filePath - absolute path to PDF
 * @returns { Promise<string[]> } chapter titles from PDF (only from "Science Chapter Planning" section; holidays/metadata excluded)
 */
export async function extractChaptersFromPdf(filePath) {
  const text = await extractPdfText(filePath);
  const planningSection = extractChapterPlanningSection(text);
  const textToUse = planningSection.length > 50 ? planningSection : text;
  let chapters = findChapters(textToUse);
  chapters = chapters.filter((c) => !isHolidayLine(c) && !isMetadataOrHolidayLine(c));
  if (chapters.length === 0 && text.length > 0) {
    const sample = textToUse.slice(0, 2000).replace(/\r?\n/g, '\n');
    console.warn('[pdfChapters] No chapters extracted from planning section. Sample:', sample);
  } else if (chapters.length === 0 && text.length === 0) {
    console.warn('[pdfChapters] PDF produced no text (empty or image-only PDF).');
  }
  return chapters;
}
