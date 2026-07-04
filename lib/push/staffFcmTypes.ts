/** FCM data payload for staff native app (Android PR1). */
export type StaffFcmDataPayload = {
  room_no: string;
  message_id: string;
  original_text: string;
  translated_text_ru: string;
  tts_lang: string;
  urgency: 'normal' | 'urgent';
  category?: string;
  auto_tts_default?: 'true' | 'false';
  /** Local notification title/body when using data-only FCM (all values are strings). */
  notify_title?: string;
  notify_body?: string;
  /** Diagnostic: target Android channel id (v3). */
  android_channel_id?: string;
};

export type StaffFcmNotificationPayload = {
  title: string;
  body: string;
};
