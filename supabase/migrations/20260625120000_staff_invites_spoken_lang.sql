-- Staff invite spoken language for receiver TTS (independent of device UI locale).

ALTER TABLE staff_invites
  ADD COLUMN IF NOT EXISTS spoken_lang text;

ALTER TABLE staff_invites
  DROP CONSTRAINT IF EXISTS staff_invites_spoken_lang_check;

ALTER TABLE staff_invites
  ADD CONSTRAINT staff_invites_spoken_lang_check
  CHECK (
    spoken_lang IS NULL
    OR spoken_lang IN ('ko', 'ru', 'vi', 'en', 'zh', 'th')
  );

-- Cleaner-1 (and cleaner1 display names): Russian TTS for current ops.
UPDATE staff_invites
SET spoken_lang = 'ru'
WHERE spoken_lang IS NULL
  AND (
    lower(trim(display_name)) IN ('cleaner-1', 'cleaner1')
    OR display_name ILIKE 'Cleaner-1%'
  );

-- Cleaner-2: set ru only when display name matches Cleaner-2 (current ru ops).
UPDATE staff_invites
SET spoken_lang = 'ru'
WHERE spoken_lang IS NULL
  AND (
    lower(trim(display_name)) IN ('cleaner-2', 'cleaner2')
    OR display_name ILIKE 'Cleaner-2%'
  );
