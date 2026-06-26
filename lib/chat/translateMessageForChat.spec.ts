import {
  detectMessageLang,
  normalizeChatText,
  stripLeadingRoomPrefix
} from './translateMessageForChat';

let ok = 0;

function check(label: string, pass: boolean) {
  console.log(pass ? 'PASS' : 'FAIL', label);
  if (pass) ok += 1;
}

check('detect ko', detectMessageLang('708호 청소 부탁합니다') === 'ko');
check('detect ru', detectMessageLang('В номере 507 пахнет сигаретами.') === 'ru');
check('normalize spaces', normalizeChatText('  507호   빨리  ') === '507호 빨리');
check(
  'strip room prefix',
  stripLeadingRoomPrefix('507호 В номере 507 пахнет сигаретами.') ===
    'В номере 507 пахнет сигаретами.'
);

process.exit(ok === 4 ? 0 : 1);
