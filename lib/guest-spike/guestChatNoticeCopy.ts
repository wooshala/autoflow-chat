// Guest Chat A4 notice copy — Source of Truth for all supported guest languages.
// Same language set as lib/guest-spike/languages.ts. Do not hardcode notice strings in UI/PDF.

import { SUPPORTED_LANGS, langDisplayName, type GuestLang } from './languages';
import { GUEST_CHAT_EMERGENCY_PHONE } from './guestChatNoticeConfig';
import {
  GUEST_NOTICE_SERVICE_IDS,
  type GuestNoticeServiceId,
} from './guestChatNoticeServices';

export type GuestNoticeServiceLabels = Record<GuestNoticeServiceId, string>;

export interface GuestChatNoticeCopy {
  /** Title under the room number. */
  roomChatSubtitle: string;
  /** One-line reason to scan (phone-free / request services). */
  valueLine: string;
  /** Line beside QR (scan instruction). */
  scanLead: string;
  /** Short value prop beside QR. */
  scanSupport: string;
  /** Short intro used in language strip. */
  helpIntro: string;
  /** Compact topic line (legacy / PDF helpers). */
  helpTopics: string;
  /** Service grid section title. */
  servicesTitle: string;
  /** Short labels for Digital Concierge service grid. */
  serviceLabels: GuestNoticeServiceLabels;
  /** Auto-translate callout. */
  translateBadge: string;
  /** Guest Chat QR caption. */
  chatQrCaption: string;
  /** Wi-Fi panel title. */
  wifiPanelTitle: string;
  /** Wi-Fi scan hint under panel title. */
  wifiScanHint: string;
  /** 5GHz band label. */
  wifi5gLabel: string;
  /** 2.4GHz band label. */
  wifi24Label: string;
  /** Password field label (value comes from room credentials). */
  wifiPasswordLabel: string;
  /** Short Wi-Fi fallback / footer note (no credential values). */
  wifiNightstand: string;
  /** Trust: availability. */
  hoursTitle: string;
  hoursBody: string;
  /** Trust: staff watching / realtime confirm. */
  staffWatchBody: string;
  /** Trust: response expectation. */
  replyTitle: string;
  replyBody: string;
  /** Privacy (must not overclaim). */
  privacyTitle: string;
  privacyBody: string;
  /** Front desk channel label (pairs with emergency). */
  frontDeskLabel: string;
  /** Emergency contact label (phone number comes from config). */
  emergencyLabel: string;
  /** Soft CTA for extra inquiries — does not guarantee post-checkout availability. */
  afterCheckout: string;
}

function labels(
  towel: string,
  water: string,
  clean: string,
  amenity: string,
  parking: string,
  delivery: string,
  repair: string,
  lost: string,
  staff: string,
  other: string,
  extend: string,
  taxi: string,
): GuestNoticeServiceLabels {
  return {
    towel,
    water,
    clean,
    amenity,
    parking,
    delivery,
    repair,
    lost,
    staff,
    other,
    extend,
    taxi,
  };
}

export const guestChatNoticeCopy: Record<GuestLang, GuestChatNoticeCopy> = {
  ko: {
    roomChatSubtitle: '객실 디지털 컨시어지 (Guest Chat)',
    valueLine: '객실에서 전화 없이 직원과 바로 대화하세요.',
    scanLead: '휴대폰 카메라로 QR을 스캔하세요.',
    scanSupport: '필요한 서비스를 실시간으로 요청하세요.',
    helpIntro: '내 언어로 직원과 대화할 수 있습니다.',
    helpTopics: '수건 · 생수 · 청소 · 시설 · 분실물 등 객실 문의를 보내 주세요.',
    servicesTitle: '이런 요청이 가능합니다',
    serviceLabels: labels(
      '추가 수건',
      '생수',
      '객실 청소',
      '어메니티',
      '주차',
      '배달',
      '시설 고장',
      '분실물',
      '직원 호출',
      '기타',
      '연장·연박',
      '택시·관광',
    ),
    translateBadge: '자동 번역 지원',
    chatQrCaption: 'Guest Chat',
    wifiPanelTitle: '객실 Wi-Fi',
    wifiScanHint: 'QR을 스캔하면 Wi-Fi에 연결됩니다. 노트북은 비밀번호를 입력하세요.',
    wifi5gLabel: '5G Wi-Fi',
    wifi24Label: '2.4G Wi-Fi',
    wifiPasswordLabel: '비밀번호',
    wifiNightstand: 'Wi-Fi QR과 비밀번호는 위 안내를 이용해 주세요.',
    hoursTitle: '언제든 문의',
    hoursBody: '문의는 언제든지 가능합니다.',
    staffWatchBody: '직원이 실시간으로 확인합니다.',
    replyTitle: '빠른 응답',
    replyBody: '가능한 한 빠르게 답변드립니다.',
    privacyTitle: '개인정보',
    privacyBody: '대화 내용은 서비스 제공을 위해서만 사용됩니다.',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: '분실물 등 추가 문의가 필요하면 QR을 스캔해 주세요.',
  },
  en: {
    roomChatSubtitle: 'In-room Digital Concierge (Guest Chat)',
    valueLine: 'Chat with staff from your room — no phone call needed.',
    scanLead: 'Scan the QR code with your phone camera.',
    scanSupport: 'Request what you need in real time.',
    helpIntro: 'Chat with staff in your language.',
    helpTopics: 'Towels, water, cleaning, facilities, lost items, and more.',
    servicesTitle: 'You can request',
    serviceLabels: labels(
      'Extra towels',
      'Water',
      'Cleaning',
      'Amenities',
      'Parking',
      'Delivery',
      'Repair',
      'Lost items',
      'Call staff',
      'Other',
      'Stay extension',
      'Taxi / local',
    ),
    translateBadge: 'Auto-translate supported',
    chatQrCaption: 'Guest Chat',
    wifiPanelTitle: 'Room Wi-Fi',
    wifiScanHint: 'Scan a QR to connect. Laptops: enter the password below.',
    wifi5gLabel: '5G Wi-Fi',
    wifi24Label: '2.4G Wi-Fi',
    wifiPasswordLabel: 'Password',
    wifiNightstand: 'Use the Wi-Fi QR codes and password above.',
    hoursTitle: 'Anytime',
    hoursBody: 'You can message us any time.',
    staffWatchBody: 'Staff check messages in real time.',
    replyTitle: 'Quick reply',
    replyBody: 'We reply as quickly as possible.',
    privacyTitle: 'Privacy',
    privacyBody: 'Chat is used only to provide hotel services.',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: 'For further help such as lost items, please scan the QR code.',
  },
  ja: {
    roomChatSubtitle: '客室デジタルコンシェルジュ（Guest Chat）',
    valueLine: '客室から電話なしでスタッフとすぐに話せます。',
    scanLead: 'スマートフォンのカメラでQRを読み取ってください。',
    scanSupport: '必要なサービスをリアルタイムでご依頼ください。',
    helpIntro: 'ご自身の言語でスタッフと会話できます。',
    helpTopics: 'タオル・水・清掃・設備・忘れ物などご連絡ください。',
    servicesTitle: 'ご依頼できること',
    serviceLabels: labels(
      '追加タオル',
      '飲料水',
      '清掃',
      'アメニティ',
      '駐車',
      'デリバリー',
      '設備故障',
      '忘れ物',
      'スタッフ呼出',
      'その他',
      '延長・連泊',
      'タクシー・観光',
    ),
    translateBadge: '自動翻訳対応',
    chatQrCaption: 'Guest Chat',
    wifiPanelTitle: '客室Wi-Fi',
    wifiScanHint: 'QRを読み取るとWi-Fiに接続できます。PCは下のパスワードを入力してください。',
    wifi5gLabel: '5G Wi-Fi',
    wifi24Label: '2.4G Wi-Fi',
    wifiPasswordLabel: 'パスワード',
    wifiNightstand: '上のWi-Fi QRとパスワードをご利用ください。',
    hoursTitle: 'いつでも',
    hoursBody: 'いつでもお問い合わせいただけます。',
    staffWatchBody: 'スタッフがリアルタイムで確認します。',
    replyTitle: '迅速な返信',
    replyBody: 'できるだけ早くご返信します。',
    privacyTitle: '個人情報',
    privacyBody: 'チャット内容はサービス提供のためのみ使用します。',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: '忘れ物など追加のご連絡はQRを読み取ってください。',
  },
  'zh-CN': {
    roomChatSubtitle: '客房数字礼宾（Guest Chat）',
    valueLine: '无需打电话，在客房即可与工作人员即时沟通。',
    scanLead: '请用手机相机扫描二维码。',
    scanSupport: '实时提交您需要的服务。',
    helpIntro: '可用您的语言与工作人员对话。',
    helpTopics: '毛巾、饮用水、清洁、设施、失物等欢迎咨询。',
    servicesTitle: '可请求的服务',
    serviceLabels: labels(
      '加毛巾',
      '饮用水',
      '客房清洁',
      '洗漱用品',
      '停车',
      '外卖',
      '设施故障',
      '失物',
      '呼叫员工',
      '其他',
      '延住/连住',
      '出租车/观光',
    ),
    translateBadge: '支持自动翻译',
    chatQrCaption: 'Guest Chat',
    wifiPanelTitle: '客房 Wi-Fi',
    wifiScanHint: '扫描二维码即可连接 Wi-Fi。笔记本电脑请输入下方密码。',
    wifi5gLabel: '5G Wi-Fi',
    wifi24Label: '2.4G Wi-Fi',
    wifiPasswordLabel: '密码',
    wifiNightstand: '请使用上方的 Wi-Fi 二维码与密码。',
    hoursTitle: '随时咨询',
    hoursBody: '随时都可以联系我们。',
    staffWatchBody: '工作人员会实时查看。',
    replyTitle: '快速回复',
    replyBody: '我们会尽快回复。',
    privacyTitle: '隐私',
    privacyBody: '聊天内容仅用于提供酒店服务。',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: '如需失物等其他帮助，请扫描二维码。',
  },
  ru: {
    roomChatSubtitle: 'Цифровой консьерж номера (Guest Chat)',
    valueLine: 'Общайтесь с персоналом из номера — без звонка.',
    scanLead: 'Отсканируйте QR-код камерой телефона.',
    scanSupport: 'Запрашивайте услуги в реальном времени.',
    helpIntro: 'Общайтесь с персоналом на своём языке.',
    helpTopics: 'Полотенца, вода, уборка, неисправности, забытые вещи и другое.',
    servicesTitle: 'Можно запросить',
    serviceLabels: labels(
      'Полотенца',
      'Вода',
      'Уборка',
      'Принадлежности',
      'Парковка',
      'Доставка',
      'Ремонт',
      'Забытые вещи',
      'Вызов персонала',
      'Другое',
      'Продление',
      'Такси / город',
    ),
    translateBadge: 'Автоперевод',
    chatQrCaption: 'Guest Chat',
    wifiPanelTitle: 'Wi-Fi номера',
    wifiScanHint: 'Сканируйте QR для подключения. Для ноутбука введите пароль ниже.',
    wifi5gLabel: '5G Wi-Fi',
    wifi24Label: '2.4G Wi-Fi',
    wifiPasswordLabel: 'Пароль',
    wifiNightstand: 'Используйте QR Wi-Fi и пароль выше.',
    hoursTitle: 'В любое время',
    hoursBody: 'Пишите нам в любое время.',
    staffWatchBody: 'Персонал видит сообщения сразу.',
    replyTitle: 'Быстрый ответ',
    replyBody: 'Ответим как можно скорее.',
    privacyTitle: 'Конфиденциальность',
    privacyBody: 'Чат используется только для оказания услуг отеля.',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: 'Для доп. помощи (забытые вещи и т.п.) отсканируйте QR.',
  },
  fr: {
    roomChatSubtitle: 'Conciergerie digitale (Guest Chat)',
    valueLine: 'Parlez au personnel depuis la chambre — sans téléphone.',
    scanLead: 'Scannez le QR avec l’appareil photo du téléphone.',
    scanSupport: 'Demandez vos services en temps réel.',
    helpIntro: 'Discutez avec le personnel dans votre langue.',
    helpTopics: 'Serviettes, eau, ménage, équipements, objets trouvés, etc.',
    servicesTitle: 'Vous pouvez demander',
    serviceLabels: labels(
      'Serviettes',
      'Eau',
      'Ménage',
      'Articles',
      'Parking',
      'Livraison',
      'Réparation',
      'Objets trouvés',
      'Appeler le staff',
      'Autre',
      'Prolongation',
      'Taxi / visite',
    ),
    translateBadge: 'Traduction auto',
    chatQrCaption: 'Guest Chat',
    wifiPanelTitle: 'Wi-Fi chambre',
    wifiScanHint: 'Scannez un QR pour vous connecter. PC : saisissez le mot de passe ci-dessous.',
    wifi5gLabel: '5G Wi-Fi',
    wifi24Label: '2.4G Wi-Fi',
    wifiPasswordLabel: 'Mot de passe',
    wifiNightstand: 'Utilisez les QR Wi-Fi et le mot de passe ci-dessus.',
    hoursTitle: 'À tout moment',
    hoursBody: 'Vous pouvez nous écrire à tout moment.',
    staffWatchBody: 'Le personnel lit vos messages en temps réel.',
    replyTitle: 'Réponse rapide',
    replyBody: 'Nous répondons aussi vite que possible.',
    privacyTitle: 'Confidentialité',
    privacyBody: 'Le chat sert uniquement à fournir les services de l’hôtel.',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: 'Pour une aide complémentaire (objets trouvés, etc.), scannez le QR.',
  },
  es: {
    roomChatSubtitle: 'Conserjería digital (Guest Chat)',
    valueLine: 'Hable con el personal desde la habitación — sin llamar.',
    scanLead: 'Escanee el QR con la cámara del teléfono.',
    scanSupport: 'Solicite servicios en tiempo real.',
    helpIntro: 'Chatee con el personal en su idioma.',
    helpTopics: 'Toallas, agua, limpieza, instalaciones, objetos perdidos y más.',
    servicesTitle: 'Puede solicitar',
    serviceLabels: labels(
      'Toallas',
      'Agua',
      'Limpieza',
      'Amenidades',
      'Parking',
      'Delivery',
      'Reparación',
      'Objetos perdidos',
      'Llamar staff',
      'Otros',
      'Extensión',
      'Taxi / turismo',
    ),
    translateBadge: 'Traducción automática',
    chatQrCaption: 'Guest Chat',
    wifiPanelTitle: 'Wi-Fi habitación',
    wifiScanHint: 'Escanee un QR para conectarse. Portátil: introduzca la contraseña abajo.',
    wifi5gLabel: '5G Wi-Fi',
    wifi24Label: '2.4G Wi-Fi',
    wifiPasswordLabel: 'Contraseña',
    wifiNightstand: 'Use los QR Wi-Fi y la contraseña de arriba.',
    hoursTitle: 'En cualquier momento',
    hoursBody: 'Puede escribirnos a cualquier hora.',
    staffWatchBody: 'El personal ve los mensajes en tiempo real.',
    replyTitle: 'Respuesta rápida',
    replyBody: 'Responderemos lo antes posible.',
    privacyTitle: 'Privacidad',
    privacyBody: 'El chat se usa solo para prestar servicios del hotel.',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: 'Para más ayuda (objetos perdidos, etc.), escanee el QR.',
  },
};

/** Ensure every language defines labels for every service id. */
export function assertServiceLabelsComplete(lang: GuestLang): void {
  const labelsMap = guestChatNoticeCopy[lang].serviceLabels;
  for (const id of GUEST_NOTICE_SERVICE_IDS) {
    if (!labelsMap[id]?.trim()) {
      throw new Error(`missing service label ${id} for ${lang}`);
    }
  }
}

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
