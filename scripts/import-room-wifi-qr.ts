/**
 * Import per-room Wi-Fi QR images and extract WIFI: payloads via ZXing.
 * Excludes sticker photos (*_02.jpg) and nested backup folders.
 *
 * Usage: npx tsx scripts/import-room-wifi-qr.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Jimp } from 'jimp';
import {
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  MultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
} from '@zxing/library';

const SRC_ROOT = path.resolve('.artifacts/wifi-qr-zip');
const OUT_DIR = path.resolve('public/wifi-qr');
const CRED_OUT = path.resolve('lib/guest-spike/roomWifiCredentials.generated.ts');

type RoomWifi = {
  roomNo: string;
  ssid24: string;
  ssid5g: string;
  password: string;
  qr24Path: string;
  qr5gPath: string;
};

function findRoomFolders(root: string): { roomNo: string; dir: string }[] {
  const rooms: { roomNo: string; dir: string }[] = [];
  const stack = [root];
  while (stack.length) {
    const d = stack.pop()!;
    if (!fs.existsSync(d)) continue;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = path.join(d, e.name);
      if (/^\d{3}$/.test(e.name)) rooms.push({ roomNo: e.name, dir: p });
      else stack.push(p);
    }
  }
  return rooms.sort((a, b) => a.roomNo.localeCompare(b.roomNo));
}

function isStickerOrBackup(file: string): boolean {
  const base = path.basename(file);
  const lower = file.toLowerCase();
  if (/_02\.jpe?g$/i.test(base)) return true;
  if (lower.includes('백업') || lower.includes('backup')) return true;
  return false;
}

function parseWifiPayload(data: string): { ssid: string; password: string } | null {
  if (!/^WIFI:/i.test(data)) return null;
  const body = data.replace(/^WIFI:/i, '');
  const sMatch = body.match(/(?:^|;)S:((?:[^\\;]|\\.)*)/i);
  const pMatch = body.match(/(?:^|;)P:((?:[^\\;]|\\.)*)/i);
  if (!sMatch) return null;
  const unescape = (v: string) => v.replace(/\\([\\;,:"])/g, '$1');
  return {
    ssid: unescape(sMatch[1] || ''),
    password: unescape(pMatch?.[1] || ''),
  };
}

async function decodeWifiQr(file: string): Promise<string | null> {
  const img = await Jimp.read(file);
  const reader = new MultiFormatReader();
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);

  for (const scale of [1, 1.5, 2]) {
    const v = img.clone().scale(scale);
    const { data, width, height } = v.bitmap;
    const luminances = new Uint8ClampedArray(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      luminances[i] = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
    }
    try {
      const source = new RGBLuminanceSource(luminances, width, height);
      const bitmap = new BinaryBitmap(new HybridBinarizer(source));
      const result = reader.decode(bitmap);
      const text = result?.getText();
      if (text) return text;
    } catch {
      /* next */
    }
    reader.reset();
  }
  return null;
}

/** Crop SSID banner above Kakao Wi-Fi QR so the printed 40mm box is mostly QR. */
async function cropQrOnly(src: string, dest: string): Promise<void> {
  const img = await Jimp.read(src);
  const w = img.width;
  const h = img.height;
  // Banner ~12–18% at top; keep a square from the lower portion.
  const top = Math.floor(h * 0.14);
  const side = Math.min(w, h - top);
  const x = Math.floor((w - side) / 2);
  const cropped = img.clone().crop({ x, y: top, w: side, h: side });
  await cropped.write(dest as `${string}.jpg`);
}

function classifyBand(ssid: string, fileName: string): '24g' | '5g' {
  if (/_5G/i.test(ssid) || /5G/i.test(ssid)) return '5g';
  if (/_01\.jpe?g$/i.test(fileName)) return '5g';
  return '24g';
}

async function main() {
  const rooms = findRoomFolders(SRC_ROOT);
  if (!rooms.length) {
    console.error('No room folders under', SRC_ROOT);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results: RoomWifi[] = [];
  const errors: string[] = [];

  for (const { roomNo, dir } of rooms) {
    const files = fs
      .readdirSync(dir)
      .filter((n) => /\.jpe?g$/i.test(n))
      .map((n) => path.join(dir, n))
      .filter((f) => !isStickerOrBackup(f));

    let ssid24 = '';
    let ssid5g = '';
    let password = '';
    let src24 = '';
    let src5g = '';

    for (const file of files) {
      const payload = await decodeWifiQr(file);
      if (!payload) {
        errors.push(`${roomNo}: decode fail ${path.basename(file)}`);
        // still keep file by name heuristic
        const base = path.basename(file);
        if (/_01\.jpe?g$/i.test(base) && !src5g) src5g = file;
        else if (!/_0\d\.jpe?g$/i.test(base) && !src24) src24 = file;
        continue;
      }
      const parsed = parseWifiPayload(payload);
      if (!parsed) {
        errors.push(`${roomNo}: not WIFI ${path.basename(file)}`);
        continue;
      }
      if (!password && parsed.password) password = parsed.password;
      const band = classifyBand(parsed.ssid, path.basename(file));
      if (band === '5g') {
        ssid5g = parsed.ssid;
        src5g = file;
      } else {
        ssid24 = parsed.ssid;
        src24 = file;
      }
    }

    if (!src24 || !src5g) {
      errors.push(`${roomNo}: missing files 24=${!!src24} 5g=${!!src5g}`);
      continue;
    }
    if (!ssid24 || !ssid5g || !password) {
      // try re-decode assigned files
      for (const [band, src] of [
        ['24', src24],
        ['5g', src5g],
      ] as const) {
        const payload = await decodeWifiQr(src);
        const parsed = payload ? parseWifiPayload(payload) : null;
        if (!parsed) continue;
        if (!password) password = parsed.password;
        if (band === '5g') ssid5g = ssid5g || parsed.ssid;
        else ssid24 = ssid24 || parsed.ssid;
      }
    }

    if (!ssid24 || !ssid5g || !password) {
      errors.push(`${roomNo}: incomplete ssid24=${ssid24} ssid5g=${ssid5g} pw=${!!password}`);
      continue;
    }

    const roomOut = path.join(OUT_DIR, roomNo);
    fs.mkdirSync(roomOut, { recursive: true });
    await cropQrOnly(src24, path.join(roomOut, '24g.jpg'));
    await cropQrOnly(src5g, path.join(roomOut, '5g.jpg'));

    results.push({
      roomNo,
      ssid24,
      ssid5g,
      password,
      qr24Path: `/wifi-qr/${roomNo}/24g.jpg`,
      qr5gPath: `/wifi-qr/${roomNo}/5g.jpg`,
    });
    console.log(`OK ${roomNo} | ${ssid24} / ${ssid5g}`);
  }

  const body = [
    '// AUTO-GENERATED by scripts/import-room-wifi-qr.ts — do not edit by hand.',
    '// Per-room Wi-Fi credentials for Guest Chat A4 notice print.',
    '',
    'export type RoomWifiCredential = {',
    '  roomNo: string;',
    '  ssid24: string;',
    '  ssid5g: string;',
    '  password: string;',
    '  qr24Path: string;',
    '  qr5gPath: string;',
    '};',
    '',
    'export const ROOM_WIFI_BY_ROOM: Record<string, RoomWifiCredential> = {',
    ...results.map(
      (r) =>
        `  '${r.roomNo}': { roomNo: '${r.roomNo}', ssid24: ${JSON.stringify(r.ssid24)}, ssid5g: ${JSON.stringify(r.ssid5g)}, password: ${JSON.stringify(r.password)}, qr24Path: '${r.qr24Path}', qr5gPath: '${r.qr5gPath}' },`,
    ),
    '};',
    '',
    'export function roomWifiFor(roomNo: string | number | null | undefined): RoomWifiCredential | null {',
    "  const key = String(roomNo ?? '').replace(/[^\\d]/g, '');",
    '  if (!key) return null;',
    '  return ROOM_WIFI_BY_ROOM[key] ?? null;',
    '}',
    '',
  ].join('\n');

  fs.writeFileSync(CRED_OUT, body, 'utf8');
  console.log(JSON.stringify({ ok: results.length, errors: errors.length, out: CRED_OUT }, null, 2));
  if (errors.length) console.error(errors.slice(0, 30).join('\n'));
  if (results.length < 35) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
