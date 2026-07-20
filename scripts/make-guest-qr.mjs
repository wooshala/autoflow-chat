// Phase 1G.4 E2E SPIKE — generate a scannable QR (PNG + terminal) for the guest URL.
// Usage: node scripts/make-guest-qr.mjs [channel_key] [host:port]
//   defaults: channel_key=room-308-live  host=192.168.0.4:3011
import QRCode from 'qrcode';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const channel = process.argv[2] || 'room-308-live';
const host = process.argv[3] || '192.168.0.4:3011';
const url = `http://${host}/g/${channel}`;

const outDir = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // repo root
const outFile = path.join(outDir, 'guest-qr.png');

console.log('Guest URL:', url);
QRCode.toString(url, { type: 'terminal', small: true }, (e, s) => { if (!e) process.stdout.write(s); });
QRCode.toFile(outFile, url, { width: 400, margin: 2 }, (e) => {
  if (e) console.error('PNG failed:', e.message);
  else console.log('Saved:', outFile);
});
