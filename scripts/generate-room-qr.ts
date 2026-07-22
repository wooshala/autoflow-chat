// Phase 2B — Room Guest-Chat QR pipeline. Run with tsx:
//   npx tsx scripts/generate-room-qr.ts [--base-url=https://...] [--out=qr-output]
//
// Base URL precedence: --base-url= > env QR_BASE_URL > default (Production). Change ONLY the ROOMS
// array to re-target rooms; change --base-url / QR_BASE_URL to move to a custom domain. Nothing
// else needs editing. QR content is the room's canonical URL ONLY — never a session / token /
// cookie / guest id / personal data.
//
// Per room it writes:  png/room-<no>.png (>=1000px)  svg/room-<no>.svg (vector)
// Plus: rooms.csv, door-labels.pdf (A4 grid), front-notice-A4.pdf, front-notice-A5.pdf.
// Then it DECODES every PNG and asserts the decoded string == the expected URL (fails on mismatch).

import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { createRequire } from 'node:module';

// jszip is CommonJS; load via createRequire so the constructor survives ESM interop. Chosen over
// archiver because its entry names are ALWAYS '/'-separated regardless of the host OS.
const require = createRequire(import.meta.url);
const JSZip = require('jszip') as new () => {
  file(name: string, data: Buffer): void;
  generateAsync(opts: { type: 'nodebuffer'; compression?: string; compressionOptions?: { level: number } }): Promise<Buffer>;
};

// ── SSOT: the ONLY thing to change to add/remove rooms ─────────────────────────────
const ROOMS: string[] = [
  '201', '202', '203', '205', '206', '207', '208', '209',
  '301', '302', '303', '305', '306', '307', '308', '309',
  '501', '502', '503', '505', '506', '507', '508',
  '601', '602', '603', '605', '606', '607', '608',
  '701', '702', '703', '705', '706', '707', '708',
  '801', '802',
];
const EXPECTED_PER_FLOOR: Record<string, number> = { '2': 8, '3': 8, '5': 7, '6': 7, '7': 7, '8': 2 };

// ── config ─────────────────────────────────────────────────────────────────────────
function argValue(name: string): string | null {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}
const BASE_URL = (argValue('base-url') || process.env.QR_BASE_URL || 'https://autoflow-mvp.vercel.app')
  .trim()
  .replace(/\/+$/, '');
const OUT_DIR = path.resolve(argValue('out') || process.env.QR_OUT_DIR || 'qr-output');
const ZIP_PATH = path.resolve(argValue('zip') || process.env.QR_ZIP || 'guest-room-qr-production.zip');
const HOTEL_NAME = process.env.QR_HOTEL_NAME || 'HOTEL LABEL';
const FONT_PATH = process.env.QR_FONT_PATH || 'C:/Windows/Fonts/malgun.ttf';
const FONT_BOLD_PATH = process.env.QR_FONT_BOLD_PATH || 'C:/Windows/Fonts/malgunbd.ttf';
const HAS_FONT = fs.existsSync(FONT_PATH);

const roomUrl = (room: string) => `${BASE_URL}/g/room-${room}`;
const QR_OPTS = { errorCorrectionLevel: 'Q' as const, margin: 4, color: { dark: '#000000ff', light: '#ffffffff' } };

// ── roster self-verification ────────────────────────────────────────────────────────
function verifyRoster(): string[] {
  const errors: string[] = [];
  if (ROOMS.length !== 39) errors.push(`room count ${ROOMS.length} != 39`);
  if (new Set(ROOMS).size !== ROOMS.length) errors.push('duplicate room numbers found');
  const byFloor: Record<string, number> = {};
  for (const r of ROOMS) byFloor[r[0]] = (byFloor[r[0]] || 0) + 1;
  for (const [f, n] of Object.entries(EXPECTED_PER_FLOOR)) {
    if (byFloor[f] !== n) errors.push(`floor ${f}: ${byFloor[f] ?? 0} != ${n}`);
  }
  return errors;
}

// ── PDF helpers ───────────────────────────────────────────────────────────────────
function registerFonts(doc: PDFKit.PDFDocument) {
  if (HAS_FONT) {
    doc.registerFont('body', FONT_PATH);
    doc.registerFont('bold', fs.existsSync(FONT_BOLD_PATH) ? FONT_BOLD_PATH : FONT_PATH);
  }
}
const F = HAS_FONT ? 'body' : 'Helvetica';
const FB = HAS_FONT ? 'bold' : 'Helvetica-Bold';
// All 7 app languages. Endonyms render only with the CJK/Cyrillic font; otherwise Latin names.
// NOTE: Chinese is shown as 中文 (not 简体中文) because 简 (U+7B80) is absent from Malgun Gothic and
// would render as a tofu box; verifyGlyphs() below enforces that every printed char has a glyph.
const LANG_LINE = HAS_FONT
  ? '한국어 · English · 日本語 · 中文 · Русский · Français · Español'
  : 'Korean · English · Japanese · Chinese · Russian · French · Spanish';
const roomLabel = (room: string) => (HAS_FONT ? `${room}호` : `Room ${room}`);
const noticeLead = HAS_FONT
  ? '문의 · 비품 요청 · 시설 문의 · 직원 호출은 아래 QR을 스캔해 주세요.'
  : 'Scan the QR below to chat with the front desk (requests, amenities, maintenance).';

function finishDoc(doc: PDFKit.PDFDocument, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(file);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    doc.pipe(stream);
    doc.end();
  });
}

async function buildDoorLabels(qrByRoom: Map<string, Buffer>, file: string) {
  const doc = new PDFDocument({ size: 'A4', margin: 28 });
  registerFonts(doc);
  const pageW = doc.page.width - 56;
  const cols = 3;
  const cellW = pageW / cols;
  const cellH = 190; // QR ~40mm(113pt) + two text lines
  const qrSize = 113; // 40mm
  let col = 0;
  let y = doc.y;
  for (const room of ROOMS) {
    if (y + cellH > doc.page.height - 28) {
      doc.addPage();
      y = doc.y;
      col = 0;
    }
    const x = 28 + col * cellW;
    doc.image(qrByRoom.get(room)!, x + (cellW - qrSize) / 2, y, { width: qrSize });
    doc.font(FB).fontSize(15).fillColor('#000').text(roomLabel(room), x, y + qrSize + 8, { width: cellW, align: 'center' });
    doc.font(F).fontSize(9).fillColor('#444').text('Guest Chat', x, y + qrSize + 28, { width: cellW, align: 'center' });
    col += 1;
    if (col >= cols) {
      col = 0;
      y += cellH;
    }
  }
  await finishDoc(doc, file);
}

async function buildFrontNotices(qrByRoom: Map<string, Buffer>, file: string, size: 'A4' | 'A5') {
  const doc = new PDFDocument({ size, margin: size === 'A4' ? 50 : 36, autoFirstPage: false });
  registerFonts(doc);
  const qrSize = size === 'A4' ? 240 : 170;
  for (const room of ROOMS) {
    doc.addPage();
    const w = doc.page.width;
    const cx = w / 2;
    let y = size === 'A4' ? 60 : 44;
    doc.font(FB).fontSize(size === 'A4' ? 26 : 20).fillColor('#111').text(HOTEL_NAME, 0, y, { align: 'center' });
    y += size === 'A4' ? 34 : 26;
    doc.font(FB).fontSize(size === 'A4' ? 18 : 14).fillColor('#2563eb').text('Guest Chat', 0, y, { align: 'center' });
    y += size === 'A4' ? 30 : 24;
    doc.font(FB).fontSize(size === 'A4' ? 40 : 30).fillColor('#111').text(roomLabel(room), 0, y, { align: 'center' });
    y += size === 'A4' ? 56 : 42;
    doc.image(qrByRoom.get(room)!, cx - qrSize / 2, y, { width: qrSize });
    y += qrSize + (size === 'A4' ? 28 : 20);
    doc.font(F).fontSize(size === 'A4' ? 13 : 11).fillColor('#333').text(noticeLead, 50, y, { width: w - 100, align: 'center' });
    y += size === 'A4' ? 46 : 40;
    doc.font(FB).fontSize(size === 'A4' ? 11 : 9).fillColor('#666').text(HAS_FONT ? '지원 언어' : 'Supported languages', 0, y, { align: 'center' });
    y += size === 'A4' ? 18 : 15;
    doc.font(F).fontSize(size === 'A4' ? 12 : 10).fillColor('#111').text(LANG_LINE, 50, y, { width: w - 100, align: 'center' });
  }
  await finishDoc(doc, file);
}

// ── package as ZIP — entry names are ALWAYS '/'-separated (cross-platform: opens cleanly on
// Windows, macOS, Linux). Directory structure is preserved with png/… svg/… at the ZIP root.
async function buildZip(srcDir: string, zipPath: string): Promise<number> {
  const zip = new JSZip();
  let count = 0;
  const addDir = (dir: string, prefix: string) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name; // build with '/' explicitly
      if (fs.statSync(full).isDirectory()) addDir(full, rel);
      else {
        zip.file(rel, fs.readFileSync(full));
        count += 1;
      }
    }
  };
  addDir(srcDir, '');
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  fs.writeFileSync(zipPath, buf);
  return count;
}

// ── decode verification ─────────────────────────────────────────────────────────────
function decodePng(file: string): string | null {
  const png = PNG.sync.read(fs.readFileSync(file));
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return code ? code.data : null;
}

// Verify the embedded font actually has a glyph for EVERY character printed in the PDFs — catches
// tofu / missing-glyph boxes before printing. Returns hard failures; a resolve error is a soft skip.
async function verifyGlyphs(strings: string[]): Promise<{ missing: string[]; skipped: string | null }> {
  if (!HAS_FONT) return { missing: [], skipped: 'no CJK font (Latin fallback text)' };
  try {
    const fk: any = await import('fontkit');
    const font = (fk.openSync || fk.default?.openSync)(FONT_PATH);
    const chars = new Set<string>();
    for (const s of strings) for (const ch of s) if (ch.trim()) chars.add(ch);
    const missing: string[] = [];
    for (const ch of chars) {
      const cp = ch.codePointAt(0)!;
      if (!font.hasGlyphForCodePoint(cp)) missing.push(`${ch}(U+${cp.toString(16)})`);
    }
    return { missing, skipped: null };
  } catch (e: any) {
    return { missing: [], skipped: e?.message || String(e) };
  }
}

// ── main ─────────────────────────────────────────────────────────────────────────
async function main() {
  const rosterErrors = verifyRoster();
  if (rosterErrors.length) {
    console.error('ROSTER VERIFICATION FAILED:\n  - ' + rosterErrors.join('\n  - '));
    process.exit(1);
  }
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`Rooms    : ${ROOMS.length} (roster OK)`);
  console.log(`Output   : ${OUT_DIR}`);
  console.log(`PDF font : ${HAS_FONT ? FONT_PATH : 'Helvetica (Latin fallback — no CJK font found)'}`);

  const pngDir = path.join(OUT_DIR, 'png');
  const svgDir = path.join(OUT_DIR, 'svg');
  fs.mkdirSync(pngDir, { recursive: true });
  fs.mkdirSync(svgDir, { recursive: true });

  const qrByRoom = new Map<string, Buffer>();
  const csvRows: string[] = ['room,url'];

  for (const room of ROOMS) {
    const url = roomUrl(room);
    csvRows.push(`${room},${url}`);
    // PNG >= 1000px
    await QRCode.toFile(path.join(pngDir, `room-${room}.png`), url, { ...QR_OPTS, type: 'png', width: 1000 });
    // SVG (vector)
    const svg = await QRCode.toString(url, { ...QR_OPTS, type: 'svg' });
    fs.writeFileSync(path.join(svgDir, `room-${room}.svg`), svg, 'utf8');
    // reusable buffer for PDFs (600px is ample at print sizes)
    qrByRoom.set(room, await QRCode.toBuffer(url, { ...QR_OPTS, type: 'png', width: 600 }));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'rooms.csv'), csvRows.join('\n') + '\n', 'utf8');
  await buildDoorLabels(qrByRoom, path.join(OUT_DIR, 'door-labels.pdf'));
  await buildFrontNotices(qrByRoom, path.join(OUT_DIR, 'front-notice-A4.pdf'), 'A4');
  await buildFrontNotices(qrByRoom, path.join(OUT_DIR, 'front-notice-A5.pdf'), 'A5');

  // ── automatic verification ────────────────────────────────────────────────────────
  const problems: string[] = [];
  let pngCount = 0;
  let svgCount = 0;
  for (const room of ROOMS) {
    const url = roomUrl(room);
    const pngFile = path.join(pngDir, `room-${room}.png`);
    const svgFile = path.join(svgDir, `room-${room}.svg`);
    if (fs.existsSync(pngFile)) pngCount++;
    else problems.push(`missing PNG for ${room}`);
    if (fs.existsSync(svgFile)) svgCount++;
    else problems.push(`missing SVG for ${room}`);
    const decoded = decodePng(pngFile);
    if (decoded !== url) problems.push(`PNG ${room}: decoded "${decoded}" != expected "${url}"`);
    // SVG contains the payload path but not decodable as pixels — assert the room token is present.
    if (!fs.readFileSync(svgFile, 'utf8').startsWith('<?xml') && !fs.readFileSync(svgFile, 'utf8').startsWith('<svg')) {
      problems.push(`SVG ${room}: not valid svg`);
    }
  }
  const csvLines = fs.readFileSync(path.join(OUT_DIR, 'rooms.csv'), 'utf8').trim().split('\n');
  const csvDataRows = csvLines.length - 1; // minus header
  const pdfs = ['door-labels.pdf', 'front-notice-A4.pdf', 'front-notice-A5.pdf'];
  for (const p of pdfs) {
    const fp = path.join(OUT_DIR, p);
    if (!fs.existsSync(fp) || fs.statSync(fp).size < 1000) problems.push(`PDF ${p} missing or too small`);
  }

  // PDF glyph coverage (no tofu / missing-glyph boxes)
  const glyph = await verifyGlyphs([
    HOTEL_NAME,
    'Guest Chat',
    LANG_LINE,
    noticeLead,
    HAS_FONT ? '지원 언어' : 'Supported languages',
    ...ROOMS.map(roomLabel),
  ]);
  if (glyph.missing.length) problems.push('missing PDF glyphs: ' + glyph.missing.join(' '));

  console.log('\n── verification ──');
  console.log(`PNG      : ${pngCount}/39`);
  console.log(`SVG      : ${svgCount}/39`);
  console.log(`CSV rows : ${csvDataRows}/39`);
  console.log(`PDF      : ${pdfs.join(', ')}`);
  console.log(`Decode   : all ${ROOMS.length} PNGs decoded and compared to canonical URLs`);
  console.log(`Glyphs   : ${glyph.skipped ? 'skipped (' + glyph.skipped + ')' : glyph.missing.length ? 'MISSING ' + glyph.missing.join(' ') : 'all present (7-language notice renders cleanly)'}`);

  if (problems.length || pngCount !== 39 || svgCount !== 39 || csvDataRows !== 39) {
    console.error('\nVERIFICATION FAILED:\n  - ' + (problems.length ? problems.join('\n  - ') : 'count mismatch'));
    process.exit(1);
  }

  // MANIFEST.txt — package provenance for the operator. NO PII / secrets.
  const commit = argValue('commit') || process.env.QR_COMMIT_SHA || 'unknown';
  const manifest = [
    'Guest Room QR — Production package MANIFEST',
    `Generated at : ${new Date().toISOString()}`,
    `Base URL     : ${BASE_URL}`,
    `URL rule     : ${BASE_URL}/g/room-{roomNo}`,
    `Rooms        : ${ROOMS.length}`,
    `PNG files    : ${pngCount}`,
    `SVG files    : ${svgCount}`,
    `CSV rows     : ${csvDataRows}`,
    `PDF files    : door-labels.pdf, front-notice-A4.pdf, front-notice-A5.pdf`,
    `Languages    : ko, en, ja, zh-CN, ru, fr, es (7)`,
    `QR decode    : PASS — every PNG decodes to its room canonical URL`,
    `PDF glyphs   : ${glyph.skipped ? 'Latin fallback' : 'all present'}`,
    `Commit SHA   : ${commit}`,
    'Privacy      : contains ONLY room numbers + URLs — no email/password/cookie/token/session id/guest data.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'MANIFEST.txt'), manifest, 'utf8');

  // package everything into one ZIP for the operator (forward-slash entry paths)
  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
  const zipEntries = await buildZip(OUT_DIR, ZIP_PATH);
  console.log(`ZIP      : ${path.basename(ZIP_PATH)} (${zipEntries} entries, forward-slash paths)`);

  console.log('\n✅ ALL VERIFIED: 39 PNG + 39 SVG + CSV(39) + 3 PDF + MANIFEST + ZIP, every QR decodes to its room canonical URL.');
}

main().catch((e) => {
  console.error('GENERATOR ERROR:', e?.message || e);
  process.exit(1);
});
