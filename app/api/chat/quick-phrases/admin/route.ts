import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { requireStaffAdmin } from '@/lib/auth/staffAdminSecret';
import {
  createQuickPhrase,
  deleteQuickPhrase,
  getQuickPhraseById,
  listQuickPhrasesAdmin,
  reorderQuickPhrases,
  updateQuickPhrase
} from '@/lib/services/quickPhrases';
import { getSiteId } from '@/lib/site';

export async function GET(req: NextRequest) {
  const denied = requireStaffAdmin(req);
  if (denied) return denied;
  try {
    const phrases = await listQuickPhrasesAdmin(getSiteId());
    return jsonOk({ phrases });
  } catch (e: unknown) {
    return jsonErr('QUICK_PHRASES_ADMIN_LIST_FAILED', e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(req: NextRequest) {
  const denied = requireStaffAdmin(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const phrase_key = String(body?.phrase_key || '').trim();
    const ko = String(body?.ko || '').trim();
    const ru = String(body?.ru || '').trim();
    if (!phrase_key || !ko || !ru) {
      return jsonErr('VALIDATION_ERROR', 'phrase_key, ko, ru 필요', 400);
    }
    const phrases = await listQuickPhrasesAdmin(getSiteId());
    const created = await createQuickPhrase({
      phrase_key,
      ko,
      ru,
      sort_order: phrases.length,
      user_id: null
    });
    return jsonOk({ phrase: created });
  } catch (e: unknown) {
    return jsonErr('QUICK_PHRASE_CREATE_FAILED', e instanceof Error ? e.message : String(e), 500);
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireStaffAdmin(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const id = String(body?.id || '').trim();
    if (!id) return jsonErr('VALIDATION_ERROR', 'id 필요', 400);
    const existing = await getQuickPhraseById(id);
    if (!existing || existing.user_id) {
      return jsonErr('FORBIDDEN', '공용 문구만 수정할 수 있습니다.', 403);
    }
    const patch: Record<string, unknown> = {};
    if (body.phrase_key != null) patch.phrase_key = String(body.phrase_key).trim();
    if (body.ko != null) patch.ko = String(body.ko).trim();
    if (body.ru != null) patch.ru = String(body.ru).trim();
    if (body.enabled != null) patch.enabled = Boolean(body.enabled);
    if (body.sort_order != null) patch.sort_order = Number(body.sort_order);
    const phrase = await updateQuickPhrase(id, patch as any);
    return jsonOk({ phrase });
  } catch (e: unknown) {
    return jsonErr('QUICK_PHRASE_UPDATE_FAILED', e instanceof Error ? e.message : String(e), 500);
  }
}

export async function DELETE(req: NextRequest) {
  const denied = requireStaffAdmin(req);
  if (denied) return denied;
  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!id.trim()) return jsonErr('VALIDATION_ERROR', 'id 필요', 400);
    const existing = await getQuickPhraseById(id.trim());
    if (!existing || existing.user_id) {
      return jsonErr('FORBIDDEN', '공용 문구만 삭제할 수 있습니다.', 403);
    }
    await deleteQuickPhrase(id.trim());
    return jsonOk({ deleted: true });
  } catch (e: unknown) {
    return jsonErr('QUICK_PHRASE_DELETE_FAILED', e instanceof Error ? e.message : String(e), 500);
  }
}

export async function PUT(req: NextRequest) {
  const denied = requireStaffAdmin(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    if (!ids.length) return jsonErr('VALIDATION_ERROR', 'ids 필요', 400);
    await reorderQuickPhrases(ids, getSiteId(), null);
    return jsonOk({ reordered: true });
  } catch (e: unknown) {
    return jsonErr('QUICK_PHRASE_REORDER_FAILED', e instanceof Error ? e.message : String(e), 500);
  }
}
