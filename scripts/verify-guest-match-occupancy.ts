/**
 * Occupancy / prior-guest match unit checks (no network).
 * Usage: npx tsx scripts/verify-guest-match-occupancy.ts
 */
import assert from 'node:assert/strict';
import {
  classifyGuestMatch,
  parseClockToMinutes,
  buildOccupancy,
  type ShadowGuestRow
} from '../lib/stayJournal/guestMatchCore';
import { toGuestMatchView } from '../lib/stayJournal/stayGuestLookup';

function row(
  p: Partial<ShadowGuestRow> & Pick<ShadowGuestRow, 'date' | 'segment' | 'guest_name'>
): ShadowGuestRow {
  return {
    room_no: '308',
    reservation_source: null,
    check_in: null,
    check_out: null,
    ...p
  };
}

function run() {
  assert.equal(parseClockToMinutes('16:45'), 16 * 60 + 45);
  assert.equal(parseClockToMinutes('5시'), 5 * 60);
  assert.equal(parseClockToMinutes('18시반'), 18 * 60 + 30);
  assert.equal(parseClockToMinutes('12'), 12 * 60);

  // Case 308: found 12:09, same-day stay check-in 16:45 → excluded → none
  {
    const found = '2026-07-09T12:09:00+09:00';
    const rows = [
      row({
        date: '2026-07-09',
        segment: 'stay',
        guest_name: '한동화',
        check_in: '16:45',
        check_out: '5시'
      })
    ];
    const view = toGuestMatchView(classifyGuestMatch(rows, found, []));
    assert.notEqual(view.guest_name, '한동화');
    assert.equal(view.status, 'none');
    console.log('PASS 308 exclude post-found check-in → none');
  }

  // Case 308 with prior overnight stay
  {
    const found = '2026-07-09T12:09:00+09:00';
    const rows = [
      row({
        date: '2026-07-09',
        segment: 'stay',
        guest_name: '한동화',
        check_in: '16:45',
        check_out: '5시'
      }),
      row({
        date: '2026-07-08',
        segment: 'stay',
        guest_name: '전날손님',
        check_in: '17:00',
        check_out: '11시'
      })
    ];
    const view = toGuestMatchView(classifyGuestMatch(rows, found, []));
    assert.equal(view.status, 'exact');
    assert.equal(view.guest_name, '전날손님');
    console.log('PASS 308 prior overnight → exact 전날손님');
  }

  // Case 205: empty → none
  {
    const found = '2026-07-07T12:58:00+09:00';
    assert.equal(toGuestMatchView(classifyGuestMatch([], found, [])).status, 'none');
    console.log('PASS 205 empty ledger → none');
  }

  // 16:00: prior stay + dayuse → multiple
  {
    const found = '2026-07-10T16:00:00+09:00';
    const rows = [
      row({
        date: '2026-07-09',
        segment: 'stay',
        guest_name: '숙박손님',
        check_in: '18:00',
        check_out: '11시',
        room_no: '201'
      }),
      row({
        date: '2026-07-10',
        segment: 'dayuse',
        guest_name: '대실손님',
        check_in: '11:00',
        check_out: '15:00',
        room_no: '201'
      })
    ];
    const view = toGuestMatchView(classifyGuestMatch(rows, found, []));
    assert.equal(view.status, 'multiple');
    assert.ok(view.candidates.length >= 2);
    console.log(
      'PASS 16:00 stay+dayuse → multiple',
      view.candidates.map((c) => `${c.guest_name}:${c.reason}`).join(' | ')
    );
  }

  // Evening in-occupancy
  {
    const found = '2026-07-09T19:51:00+09:00';
    const rows = [
      row({
        date: '2026-07-09',
        segment: 'stay',
        guest_name: '원종현',
        check_in: '19:15',
        check_out: null,
        room_no: '309'
      })
    ];
    const view = toGuestMatchView(classifyGuestMatch(rows, found, []));
    assert.equal(view.status, 'exact');
    assert.equal(view.guest_name, '원종현');
    console.log('PASS 309 evening in-occupancy → exact');
  }

  const occ = buildOccupancy(
    row({ date: '2026-07-08', segment: 'stay', guest_name: 'X', check_in: '16:45', check_out: '5시' })
  );
  assert.ok(occ);
  assert.ok(occ!.end.getTime() > occ!.start.getTime());

  console.log('ALL PASS');
}

run();
