/** Mock rows for Operation Console layout PoC — not SoT */

export type MockMaintenanceRow = {
  id: string;
  room_no: string;
  title: string;
  time_label: string;
};

export type MockWorkRow = {
  id: string;
  text: string;
  time_label: string;
};

export const MOCK_MAINTENANCE_ROWS: MockMaintenanceRow[] = [
  { id: 'mock-mt-1', room_no: '502', title: '에어컨 냄새', time_label: '11:42' },
  { id: 'mock-mt-2', room_no: '203', title: '조명 전구', time_label: '10:31' },
  { id: 'mock-mt-3', room_no: '301', title: '샤워기 수압', time_label: '09:18' }
];

export const MOCK_RECENT_WORK_ROWS: MockWorkRow[] = [
  { id: 'mock-wk-1', text: '203호 청소 완료', time_label: '12:14' },
  { id: 'mock-wk-2', text: '201호 수건 추가 요청', time_label: '11:58' },
  { id: 'mock-wk-3', text: '502호 냄새 점검 요청', time_label: '11:42' },
  { id: 'mock-wk-4', text: '101호 체크아웃 완료', time_label: '10:05' }
];
