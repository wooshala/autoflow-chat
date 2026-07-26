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
  /** Short intro used in language strip — QR how-to in that language. */
  helpIntro: string;
  /** Language-strip section title (how to use room QR). */
  howToTitle: string;
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
  /** Hero phone-demo: guest request line (short). */
  demoGuest: string;
  /** Hero phone-demo: staff reply line (short). */
  demoStaff: string;
  /** Optional caption under phone demo. */
  demoCaption: string;
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
    scanLead: 'QR을 스캔하면 바로 대화를 시작할 수 있습니다.',
    scanSupport: '필요한 서비스를 실시간으로 요청하세요.',
    helpIntro: '휴대폰 카메라로 위 Guest Chat QR을 스캔하세요.',
    howToTitle: '객실 QR 사용 방법',
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
    demoGuest: '생수 부탁드립니다',
    demoStaff: '네, 곧 가져다드리겠습니다',
    demoCaption: '스캔 후 이렇게 대화합니다',
    wifiPanelTitle: '객실 Wi-Fi',
    wifiScanHint: 'QR을 스캔하면 자동으로 연결됩니다.',
    wifi5gLabel: '5GHz',
    wifi24Label: '2.4GHz',
    wifiPasswordLabel: '비밀번호',
    wifiNightstand: 'Wi-Fi QR과 비밀번호는 본 안내를 이용해 주세요.',
    hoursTitle: '24시간',
    hoursBody: '24시간 이용 가능합니다.',
    staffWatchBody: '직원이 실시간으로 확인합니다.',
    replyTitle: '전화 불필요',
    replyBody: '전화 없이 요청하세요.',
    privacyTitle: '개인정보',
    privacyBody: '대화 내용은 서비스 제공을 위해서만 사용됩니다.',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: '분실물 등 추가 문의가 필요하면 QR을 스캔해 주세요.',
  },
  en: {
    roomChatSubtitle: 'In-room Digital Concierge (Guest Chat)',
    valueLine: 'Chat with staff from your room — no phone call needed.',
    scanLead: 'Scan the QR code to start chatting right away.',
    scanSupport: 'Request what you need in real time.',
    helpIntro: 'Scan the Guest Chat QR above with your phone camera.',
    howToTitle: 'How to use the room QR',
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
    demoGuest: 'Bottled water, please',
    demoStaff: 'Of course — right away',
    demoCaption: 'After scanning, chat like this',
    wifiPanelTitle: 'Room Wi-Fi',
    wifiScanHint: 'Scan the QR code to connect automatically.',
    wifi5gLabel: '5GHz',
    wifi24Label: '2.4GHz',
    wifiPasswordLabel: 'Password',
    wifiNightstand: 'Use the Wi-Fi QR codes and password on this notice.',
    hoursTitle: '24 hours',
    hoursBody: 'Available 24 hours.',
    staffWatchBody: 'Staff check messages in real time.',
    replyTitle: 'No call needed',
    replyBody: 'No need to call.',
    privacyTitle: 'Privacy',
    privacyBody: 'Chat is used only to provide hotel services.',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: 'For further help such as lost items, please scan the QR code.',
  },
  ja: {
    roomChatSubtitle: '客室デジタルコンシェルジュ（Guest Chat）',
    valueLine: '客室から電話なしでスタッフとすぐに話せます。',
    scanLead: 'QRを読み取るとすぐに会話を始められます。',
    scanSupport: '必要なサービスをリアルタイムでご依頼ください。',
    helpIntro: 'スマートフォンのカメラで上のGuest Chat QRを読み取ってください。',
    howToTitle: '客室QRの使い方',
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
    demoGuest: 'お水をお願いします',
    demoStaff: 'すぐに届けます',
    demoCaption: '読み取り後、このように会話します',
    wifiPanelTitle: '客室Wi-Fi',
    wifiScanHint: 'QRを読み取ると自動で接続されます。',
    wifi5gLabel: '5GHz',
    wifi24Label: '2.4GHz',
    wifiPasswordLabel: 'パスワード',
    wifiNightstand: '本案内のWi-Fi QRとパスワードをご利用ください。',
    hoursTitle: 'いつでも',
    hoursBody: '24時間ご利用いただけます。',
    staffWatchBody: 'スタッフがリアルタイムで確認します。',
    replyTitle: '電話不要',
    replyBody: '電話なしでご依頼ください。',
    privacyTitle: '個人情報',
    privacyBody: 'チャット内容はサービス提供のためのみ使用します。',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: '忘れ物など追加のご連絡はQRを読み取ってください。',
  },
  'zh-CN': {
    roomChatSubtitle: '客房数字礼宾（Guest Chat）',
    valueLine: '无需打电话，在客房即可与工作人员即时沟通。',
    scanLead: '扫描二维码即可立即开始对话。',
    scanSupport: '实时提交您需要的服务。',
    helpIntro: '请用手机相机扫描上方 Guest Chat 二维码。',
    howToTitle: '客房二维码使用方法',
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
    demoGuest: '请送瓶装水',
    demoStaff: '好的，马上送去',
    demoCaption: '扫码后即可这样对话',
    wifiPanelTitle: '客房 Wi-Fi',
    wifiScanHint: '扫描二维码即可自动连接。',
    wifi5gLabel: '5GHz',
    wifi24Label: '2.4GHz',
    wifiPasswordLabel: '密码',
    wifiNightstand: '请使用本页的 Wi-Fi 二维码与密码。',
    hoursTitle: '24小时',
    hoursBody: '全天24小时可用。',
    staffWatchBody: '工作人员会实时查看。',
    replyTitle: '无需致电',
    replyBody: '无需打电话即可请求。',
    privacyTitle: '隐私',
    privacyBody: '聊天内容仅用于提供酒店服务。',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: '如需失物等其他帮助，请扫描二维码。',
  },
  ru: {
    roomChatSubtitle: 'Цифровой консьерж номера (Guest Chat)',
    valueLine: 'Общайтесь с персоналом из номера — без звонка.',
    scanLead: 'Отсканируйте QR-код, чтобы сразу начать чат.',
    scanSupport: 'Запрашивайте услуги в реальном времени.',
    helpIntro: 'Отсканируйте QR Guest Chat выше камерой телефона.',
    howToTitle: 'Как пользоваться QR номера',
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
    demoGuest: 'Принесите воду, пожалуйста',
    demoStaff: 'Конечно, сейчас принесём',
    demoCaption: 'После сканирования чат выглядит так',
    wifiPanelTitle: 'Wi-Fi номера',
    wifiScanHint: 'Отсканируйте QR — подключение выполнится автоматически.',
    wifi5gLabel: '5GHz',
    wifi24Label: '2.4GHz',
    wifiPasswordLabel: 'Пароль',
    wifiNightstand: 'Используйте QR Wi-Fi и пароль на этом листе.',
    hoursTitle: '24 часа',
    hoursBody: 'Доступно 24 часа.',
    staffWatchBody: 'Персонал видит сообщения сразу.',
    replyTitle: 'Без звонка',
    replyBody: 'Звонить не нужно.',
    privacyTitle: 'Конфиденциальность',
    privacyBody: 'Чат используется только для оказания услуг отеля.',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: 'Для доп. помощи (забытые вещи и т.п.) отсканируйте QR.',
  },
  fr: {
    roomChatSubtitle: 'Conciergerie digitale (Guest Chat)',
    valueLine: 'Parlez au personnel depuis la chambre — sans téléphone.',
    scanLead: 'Scannez le QR pour démarrer la conversation immédiatement.',
    scanSupport: 'Demandez vos services en temps réel.',
    helpIntro: 'Scannez le QR Guest Chat ci-dessus avec l’appareil photo.',
    howToTitle: 'Comment utiliser le QR chambre',
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
    demoGuest: 'De l’eau en bouteille, s’il vous plaît',
    demoStaff: 'Bien sûr, tout de suite',
    demoCaption: 'Après le scan, discutez ainsi',
    wifiPanelTitle: 'Wi-Fi chambre',
    wifiScanHint: 'Scannez le QR pour vous connecter automatiquement.',
    wifi5gLabel: '5GHz',
    wifi24Label: '2.4GHz',
    wifiPasswordLabel: 'Mot de passe',
    wifiNightstand: 'Utilisez les QR Wi-Fi et le mot de passe de cette fiche.',
    hoursTitle: '24 h/24',
    hoursBody: 'Disponible 24 h/24.',
    staffWatchBody: 'Le personnel lit vos messages en temps réel.',
    replyTitle: 'Sans appel',
    replyBody: 'Pas besoin d’appeler.',
    privacyTitle: 'Confidentialité',
    privacyBody: 'Le chat sert uniquement à fournir les services de l’hôtel.',
    frontDeskLabel: 'Front Desk',
    emergencyLabel: 'Emergency',
    afterCheckout: 'Pour une aide complémentaire (objets trouvés, etc.), scannez le QR.',
  },
  es: {
    roomChatSubtitle: 'Conserjería digital (Guest Chat)',
    valueLine: 'Hable con el personal desde la habitación — sin llamar.',
    scanLead: 'Escanee el QR para empezar a conversar de inmediato.',
    scanSupport: 'Solicite servicios en tiempo real.',
    helpIntro: 'Escanee el QR de Guest Chat de arriba con la cámara.',
    howToTitle: 'Cómo usar el QR de la habitación',
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
    demoGuest: 'Agua embotellada, por favor',
    demoStaff: 'Claro, enseguida',
    demoCaption: 'Tras escanear, chatee así',
    wifiPanelTitle: 'Wi-Fi habitación',
    wifiScanHint: 'Escanee el QR para conectarse automáticamente.',
    wifi5gLabel: '5GHz',
    wifi24Label: '2.4GHz',
    wifiPasswordLabel: 'Contraseña',
    wifiNightstand: 'Use los QR Wi-Fi y la contraseña de este aviso.',
    hoursTitle: '24 horas',
    hoursBody: 'Disponible 24 horas.',
    staffWatchBody: 'El personal ve los mensajes en tiempo real.',
    replyTitle: 'Sin llamada',
    replyBody: 'No hace falta llamar.',
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
