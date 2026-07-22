// Phase 2C — PURE builder for the "your room changed" guest message + move-target validation.
// Import-free so it runs under `node --test`. The valid-room set is passed IN (from the SSOT
// STAFF_ROOM_OPTIONS) so this module never hardcodes a roster. The guest is shown the message in
// their SESSION language; when the session has no language yet, it falls back to Korean + English
// together (the guest surface defaults an unknown viewer language to 'en').

export type RoomMoveMessage = { original: string; originalLang: string; translated: Record<string, string> };

const SUPPORTED = new Set(['ko', 'en', 'ja', 'zh-CN', 'ru', 'fr', 'es']);

/** One place for every language's wording — never scattered across components. */
function template(lang: string, roomNo: string): string {
  switch (lang) {
    case 'ko':
      return `객실이 변경되었습니다. 이동하신 ${roomNo}호 객실의 QR을 다시 촬영해 주세요. 현재 채팅은 종료됩니다.`;
    case 'ja':
      return `お部屋が変更されました。移動先の${roomNo}号室のQRコードを再度スキャンしてください。このチャットは終了します。`;
    case 'zh-CN':
      return `您的房间已更改。请扫描${roomNo}号房间的二维码。此聊天即将结束。`;
    case 'ru':
      return `Ваш номер изменён. Пожалуйста, отсканируйте QR-код в номере ${roomNo}. Этот чат будет закрыт.`;
    case 'fr':
      return `Votre chambre a changé. Veuillez scanner le QR code de la chambre ${roomNo}. Cette conversation va se fermer.`;
    case 'es':
      return `Su habitación ha cambiado. Escanee el código QR de la habitación ${roomNo}. Este chat se cerrará.`;
    default: // en
      return `Your room has changed. Please scan the QR code in room ${roomNo}. This chat will now close.`;
  }
}

export function buildRoomMoveMessage(langCode: string | null | undefined, roomNo: string): RoomMoveMessage {
  const ko = template('ko', roomNo);
  const en = template('en', roomNo);
  const lang = langCode && SUPPORTED.has(langCode) ? langCode : null;
  // Staff always sees Korean (original_lang='ko'); the guest sees translated[viewerLang].
  const translated: Record<string, string> = { ko, en };
  if (lang && lang !== 'ko' && lang !== 'en') translated[lang] = template(lang, roomNo);
  // No chosen language yet → the guest surface defaults viewer language to 'en', so show ko + en.
  if (!lang) translated.en = `${ko}\n\n${en}`;
  return { original: `${ko}\n\n${en}`, originalLang: 'ko', translated };
}

export type MoveTargetResult = { ok: true; roomNo: string } | { ok: false; code: 'EMPTY' | 'UNKNOWN_ROOM' | 'SAME_ROOM' };

/** Validate a move target against the authoritative room set. currentRoomNo blocks a no-op move. */
export function normalizeMoveTarget(
  raw: unknown,
  currentRoomNo: string | null,
  validRooms: ReadonlySet<string>,
): MoveTargetResult {
  const roomNo = String(raw ?? '').trim();
  if (!roomNo) return { ok: false, code: 'EMPTY' };
  if (!validRooms.has(roomNo)) return { ok: false, code: 'UNKNOWN_ROOM' };
  if (currentRoomNo && roomNo === currentRoomNo) return { ok: false, code: 'SAME_ROOM' };
  return { ok: true, roomNo };
}
