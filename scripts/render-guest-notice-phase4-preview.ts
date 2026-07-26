/**
 * Phase 4 local preview: chat-first A4 notice with inline Wi-Fi SVGs.
 * Writes HTML + PNG to ../univer-ops/guest-notice-preview and .artifacts/
 *
 * Run: npx tsx scripts/render-guest-notice-phase4-preview.ts
 */
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

import { buildGuestChatNoticeHtml } from '../lib/guest-spike/guestChatNoticePrintHtml.ts';
import {
  buildGuestChatNoticeQrSvg,
  buildWifiNoticeQrSvg,
} from '../lib/guest-spike/buildGuestChatNoticeQrSvg.ts';
import { GUEST_CHAT_HOTEL_NAME } from '../lib/guest-spike/guestChatNoticeConfig.ts';
import { guestRoomUrl } from '../lib/guest-spike/guestRoomUrl.ts';
import { roomWifiFor } from '../lib/guest-spike/roomWifiCredentials.generated.ts';

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const root = join(__dirname, '..');
  const room = process.env.ROOM || '201';
  const outLocal = join(root, '.artifacts', 'phase4');
  const outPreview = join(root, '..', 'univer-ops', 'guest-notice-preview');

  mkdirSync(outLocal, { recursive: true });
  mkdirSync(outPreview, { recursive: true });

  const url = guestRoomUrl(room);
  const wifi = roomWifiFor(room);
  if (!wifi) throw new Error(`No Wi-Fi credentials for room ${room}`);

  const [qrSvg, wifiQrSvg5g, wifiQrSvg24] = await Promise.all([
    buildGuestChatNoticeQrSvg(url),
    buildWifiNoticeQrSvg(wifi.ssid5g, wifi.password),
    buildWifiNoticeQrSvg(wifi.ssid24, wifi.password),
  ]);

  const html = buildGuestChatNoticeHtml({
    roomNo: room,
    guestUrl: url,
    qrSvg,
    wifiQrSvg5g,
    wifiQrSvg24,
    hotelName: GUEST_CHAT_HOTEL_NAME,
  });

  const htmlPath = join(outLocal, `phase4-${room}.html`);
  const pngPath = join(outLocal, `phase4-${room}.png`);
  writeFileSync(htmlPath, html, 'utf8');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1280, deviceScaleFactor: 2 });
    await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.guest-notice-sheet');
    const sheet = await page.$('.guest-notice-sheet');
    if (!sheet) throw new Error('sheet missing');
    await sheet.screenshot({ path: pngPath, type: 'png' });

    const pdfPath = join(outLocal, `phase4-${room}.pdf`);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '7mm', right: '7mm', bottom: '7mm', left: '7mm' },
    });

    for (const [src, name] of [
      [htmlPath, 'phase4-after.html'],
      [pngPath, 'phase4-after.png'],
      [pdfPath, 'phase4-after.pdf'],
    ] as const) {
      copyFileSync(src, join(outPreview, name));
      copyFileSync(src, join(outPreview, name.replace('phase4-', '')));
    }

    console.log(
      JSON.stringify(
        {
          room,
          chatQrMm: 44,
          wifiQrMm: 28,
          layout: 'chat-first-wifi',
          html: htmlPath,
          png: pngPath,
          pdf: pdfPath,
          previewDir: outPreview,
          wifiInlineSvg: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
