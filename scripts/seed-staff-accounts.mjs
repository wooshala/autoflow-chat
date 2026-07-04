#!/usr/bin/env node
/**
 * Seed staff accounts (Cleaner-3 ~ Cleaner-10).
 *
 * Usage:
 *   node scripts/seed-staff-accounts.mjs              # dry-run (default)
 *   node scripts/seed-staff-accounts.mjs --apply      # actually insert
 *
 * Idempotent: skips any display_name that already exists in staff_accounts.
 * Uses the same scrypt hashing as lib/services/staffAccounts.ts.
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── load .env.local ──────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
try {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* no .env.local — rely on already-set env */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_PRIMARY_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const DRY_RUN = !process.argv.includes('--apply');

// ── scrypt hash (identical to lib/services/staffAccounts.ts) ─────────────────
const SCRYPT_KEYLEN = 32;
function hashLoginCode(code) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(code, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

// ── target accounts ──────────────────────────────────────────────────────────
const SITE_ID = 'default';
const ROLE = 'cleaning';
const SPOKEN_LANG = 'ru';

const TARGETS = [];
for (let i = 3; i <= 10; i++) {
  TARGETS.push({
    displayName: `Cleaner-${i}`,
    pin: String(1000 + i),        // 1003 ~ 1010
    role: ROLE,
    siteId: SITE_ID,
    spokenLang: SPOKEN_LANG,
  });
}

// Also ensure Cleaner-1/2 PINs are 1001/1002 (verification only, no overwrite)

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY (will insert)'}\n`);

  // 1. Fetch existing staff_accounts
  const { data: existing, error: listErr } = await sb
    .from('staff_accounts')
    .select('display_name, user_id, id')
    .eq('site_id', SITE_ID);
  if (listErr) throw listErr;

  const existingNames = new Set(existing.map((r) => r.display_name));
  console.log(`Existing accounts: ${[...existingNames].join(', ')}\n`);

  const toCreate = TARGETS.filter((t) => !existingNames.has(t.displayName));
  if (toCreate.length === 0) {
    console.log('All target accounts already exist. Nothing to do.');
    return;
  }

  console.log(`Will create ${toCreate.length} account(s):`);
  for (const t of toCreate) {
    console.log(`  ${t.displayName}  PIN=${t.pin}  role=${t.role}  site=${t.siteId}`);
  }
  console.log();

  if (DRY_RUN) {
    console.log('Dry-run complete. Re-run with --apply to insert.');
    return;
  }

  // 2. Insert into `users` table first (FK target)
  for (const t of toCreate) {
    const userId = randomUUID();
    t._userId = userId;

    const { error: uErr } = await sb.from('users').insert({
      id: userId,
      name: t.displayName,
      role: t.role,
      language: 'ko',
      pin: null,
    });
    if (uErr) {
      console.error(`  [ERROR] users insert for ${t.displayName}:`, uErr.message);
      continue;
    }
    console.log(`  [OK] users: ${t.displayName} → ${userId}`);
  }

  // 3. Insert into `staff_accounts`
  for (const t of toCreate) {
    if (!t._userId) continue; // users insert failed
    const hash = hashLoginCode(t.pin);
    const { error: aErr } = await sb.from('staff_accounts').insert({
      user_id: t._userId,
      display_name: t.displayName,
      login_code_hash: hash,
      role: t.role,
      site_id: t.siteId,
      spoken_lang: t.spokenLang,
      is_active: true,
      failed_attempts: 0,
      locked_until: null,
    });
    if (aErr) {
      console.error(`  [ERROR] staff_accounts insert for ${t.displayName}:`, aErr.message);
      continue;
    }
    console.log(`  [OK] staff_accounts: ${t.displayName}  PIN=${t.pin}`);
  }

  // 4. Verify
  const { data: all } = await sb
    .from('staff_accounts')
    .select('display_name, user_id, is_active')
    .eq('site_id', SITE_ID)
    .order('display_name');
  console.log('\nFinal roster:');
  for (const r of all || []) {
    console.log(`  ${r.display_name}  active=${r.is_active}  user_id=${r.user_id}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
