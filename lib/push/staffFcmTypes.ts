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
};

export type StaffFcmNotificationPayload = {
  title: string;
  body: string;
};
