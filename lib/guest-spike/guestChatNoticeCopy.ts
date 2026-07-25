// Guest Chat A4 notice copy — Source of Truth for all supported guest languages.
// Same language set as lib/guest-spike/languages.ts. Do not hardcode notice strings in UI/PDF.

import { SUPPORTED_LANGS, langDisplayName, type GuestLang } from './languages';
import { GUEST_CHAT_EMERGENCY_PHONE } from './guestChatNoticeConfig';

export interface GuestChatNoticeCopy {
  /** Subtitle under the room number. */
  roomChatSubtitle: string;
  /** Line above the QR. */
  scanLead: string;
  /** Short value prop under scanLead. */
  scanSupport: string;
  /** Intro for amenity / help examples. */
  helpIntro: string;
  /** Example request topics (towel, water, cleaning, facility, other). */
  helpTopics: string;
  /** Wi-Fi: nightstand phone-table sticker — never print real SSID/password values. */
  wifiNightstand: string;
  /** Footer: 24h availability title. */
  hoursTitle: string;
  hoursBody: string;
  /** Footer: response expectation. */
  replyTitle: string;
  replyBody: string;
  /** Footer: privacy (must not overclaim — chat/customer fields may be stored). */
  privacyTitle: string;
  privacyBody: string;
  /** Emergency contact label (phone number comes from config). */
  emergencyLabel: string;
  /** Soft CTA for extra inquiries (lost items) — does not guarantee post-checkout availability. */
  afterCheckout: string;
}

export const guestChatNoticeCopy: Record<GuestLang, GuestChatNoticeCopy> = {
  ko: {
    roomChatSubtitle: '객실 전용 채팅 (Guest Chat)',
    scanLead: '휴대폰 카메라로 QR을 스캔하세요.',
    scanSupport: '직원과 실시간으로 대화할 수 있습니다.',
    helpIntro: '직원에게 실시간으로 문의할 수 있습니다.',
    helpTopics: '수건 · 생수 · 청소 · 시설 문의 · 기타 요청 등을 언제든지 보내 주세요.',
    wifiNightstand:
      'Wi-Fi ID와 비밀번호는 전화기가 놓여 있는 협탁의 Wi-Fi QR 스티커에서 확인할 수 있습니다. QR을 스캔하거나 적혀 있는 ID와 비밀번호를 입력해 주세요.',
    hoursTitle: '24시간 문의',
    hoursBody: '24시간 언제든지 문의 가능합니다.',
    replyTitle: '응답',
    replyBody: '직원이 가능한 한 빠르게 답변드립니다.',
    privacyTitle: '개인정보',
    privacyBody: '대화 내용은 문의 응대와 서비스 제공을 위해 사용됩니다.',
    emergencyLabel: '긴급 연락',
    afterCheckout: '분실물 등 추가 문의가 필요하면 QR을 스캔해 주세요.',
  },
  en: {
    roomChatSubtitle: 'In-room Guest Chat',
    scanLead: 'Scan the QR code with your phone camera.',
    scanSupport: 'Chat with hotel staff in real time.',
    helpIntro: 'You can message staff anytime.',
    helpTopics: 'Towels, bottled water, cleaning, facility issues, and other requests are welcome.',
    wifiNightstand:
      'Wi-Fi ID and password are on the Wi-Fi QR sticker on the nightstand where the phone is placed. Scan the sticker or enter the ID and password printed there.',
    hoursTitle: '24-hour support',
    hoursBody: 'You can contact us any time, day or night.',
    replyTitle: 'Replies',
    replyBody: 'Staff will reply as quickly as possible.',
    privacyTitle: 'Privacy',
    privacyBody: 'Chat messages are used to respond to your requests and provide hotel services.',
    emergencyLabel: 'Emergency',
    afterCheckout: 'If you need further help such as lost items, please scan the QR code.',
  },
  ja: {
    roomChatSubtitle: '客室専用チャット（Guest Chat）',
    scanLead: 'スマートフォンのカメラでQRを読み取ってください。',
    scanSupport: 'スタッフとリアルタイムで会話できます。',
    helpIntro: 'スタッフへいつでもご連絡いただけます。',
    helpTopics: 'タオル・飲料水・清掃・設備の不具合・その他のご要望をお送りください。',
    wifiNightstand:
      'Wi-FiのIDとパスワードは、電話機が置いてあるサイドテーブル上のWi-Fi QRステッカーでご確認いただけます。ステッカーを読み取るか、記載のIDとパスワードを入力してください。',
    hoursTitle: '24時間対応',
    hoursBody: '昼夜を問わずお問い合わせいただけます。',
    replyTitle: '返信',
    replyBody: 'スタッフができるだけ早くご返信します。',
    privacyTitle: '個人情報',
    privacyBody: 'チャット内容はお問い合わせ対応およびサービス提供のために使用します。',
    emergencyLabel: '緊急連絡',
    afterCheckout: '忘れ物など追加のご連絡がある場合は、QRを読み取ってください。',
  },
  'zh-CN': {
    roomChatSubtitle: '客房专用聊天（Guest Chat）',
    scanLead: '请用手机相机扫描二维码。',
    scanSupport: '可与工作人员实时沟通。',
    helpIntro: '可随时向工作人员咨询。',
    helpTopics: '毛巾、饮用水、清洁、设施问题及其他需求，欢迎随时发送。',
    wifiNightstand:
      'Wi-Fi 账号与密码可在放置电话的床头柜上的 Wi-Fi 二维码贴纸中查看。请扫描贴纸，或输入贴纸上的账号与密码。',
    hoursTitle: '24小时咨询',
    hoursBody: '全天均可联系我们。',
    replyTitle: '回复',
    replyBody: '工作人员将尽快回复。',
    privacyTitle: '隐私',
    privacyBody: '聊天内容用于回应您的请求并提供酒店服务。',
    emergencyLabel: '紧急联系',
    afterCheckout: '如需失物等其他咨询，请扫描二维码。',
  },
  ru: {
    roomChatSubtitle: 'Чат номера (Guest Chat)',
    scanLead: 'Отсканируйте QR-код камерой телефона.',
    scanSupport: 'Общайтесь с персоналом в реальном времени.',
    helpIntro: 'Вы можете писать персоналу в любое время.',
    helpTopics: 'Полотенца, вода, уборка, неисправности и другие запросы — приветствуются.',
    wifiNightstand:
      'ID и пароль Wi-Fi указаны на QR-наклейке Wi-Fi на тумбочке, где лежит телефон. Отсканируйте наклейку или введите ID и пароль с неё.',
    hoursTitle: 'Круглосуточно',
    hoursBody: 'Связаться с нами можно в любое время.',
    replyTitle: 'Ответ',
    replyBody: 'Персонал ответит как можно скорее.',
    privacyTitle: 'Конфиденциальность',
    privacyBody: 'Сообщения чата используются для ответа на ваши запросы и оказания услуг отеля.',
    emergencyLabel: 'Экстренная связь',
    afterCheckout: 'Если нужны дополнительные вопросы (например, забытые вещи), отсканируйте QR-код.',
  },
  fr: {
    roomChatSubtitle: 'Chat de chambre (Guest Chat)',
    scanLead: 'Scannez le QR avec l’appareil photo de votre téléphone.',
    scanSupport: 'Discutez en temps réel avec le personnel.',
    helpIntro: 'Vous pouvez contacter le personnel à tout moment.',
    helpTopics: 'Serviettes, eau, ménage, équipements et autres demandes sont les bienvenues.',
    wifiNightstand:
      'L’identifiant et le mot de passe Wi-Fi figurent sur l’autocollant QR Wi-Fi de la table de chevet où se trouve le téléphone. Scannez l’autocollant ou saisissez l’identifiant et le mot de passe indiqués.',
    hoursTitle: 'Assistance 24 h/24',
    hoursBody: 'Vous pouvez nous contacter à toute heure.',
    replyTitle: 'Réponse',
    replyBody: 'Le personnel répondra aussi vite que possible.',
    privacyTitle: 'Confidentialité',
    privacyBody:
      'Les messages du chat sont utilisés pour répondre à vos demandes et fournir les services de l’hôtel.',
    emergencyLabel: 'Urgence',
    afterCheckout: 'Pour toute demande complémentaire (objets trouvés, etc.), veuillez scanner le QR.',
  },
  es: {
    roomChatSubtitle: 'Chat de la habitación (Guest Chat)',
    scanLead: 'Escanee el QR con la cámara del teléfono.',
    scanSupport: 'Hable en tiempo real con el personal.',
    helpIntro: 'Puede escribir al personal en cualquier momento.',
    helpTopics: 'Toallas, agua, limpieza, instalaciones y otras solicitudes son bienvenidas.',
    wifiNightstand:
      'El ID y la contraseña del Wi-Fi están en la pegatina QR de Wi-Fi de la mesita donde está el teléfono. Escanee la pegatina o introduzca el ID y la contraseña indicados.',
    hoursTitle: 'Atención 24 h',
    hoursBody: 'Puede contactarnos a cualquier hora.',
    replyTitle: 'Respuesta',
    replyBody: 'El personal responderá lo antes posible.',
    privacyTitle: 'Privacidad',
    privacyBody:
      'Los mensajes del chat se usan para responder a sus solicitudes y prestar servicios del hotel.',
    emergencyLabel: 'Emergencia',
    afterCheckout: 'Si necesita más ayuda (objetos perdidos, etc.), escanee el código QR.',
  },
};

/** Language names for the notice, in SUPPORTED_LANGS order (SoT: langDisplayName). */
export function guestChatNoticeLanguageLine(): string {
  return SUPPORTED_LANGS.map((lang) => langDisplayName(lang)).join(' · ');
}

export function guestChatNoticeEmergencyLine(lang: GuestLang = 'ko'): string {
  const copy = guestChatNoticeCopy[lang];
  return `${copy.emergencyLabel}  ${GUEST_CHAT_EMERGENCY_PHONE}`;
}

export function noticeCopyFor(lang: GuestLang): GuestChatNoticeCopy {
  return guestChatNoticeCopy[lang];
}
