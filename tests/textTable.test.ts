import { describe, it, expect } from 'vitest';
import { parsePastedDispatchTable } from '../services/textTableParser';
import { DriverRegistry } from '../types';

const registry: DriverRegistry = {};

// Built from the real dashboard rows the user works with, including a
// wrapped allocation cell and a thousands-separated volume.
const SAMPLE = `YOW 取货表
发货日期: 2026-07-09  发货批次: OSUB-202607072019
路线号\t团队 ID\t货量 (10,839)\t状态\t扫单号\t审核状态\t预派发规则\t拆分份数
33011\t-\t465\tPENDING\t8257\t待转扫\t1-253(33011-2-1),254-473(33011-2-2)\t2
33012\t-\t577\tPENDING\t8258\t待转扫\t1-181(33012-3-1),182-352(33012-3-
2),353-580(33012-3-3)\t3
33022\t-\t1,156\tPENDING\t8222\t待转扫\t1-290(33022-4-1),291-609(33022-4-
2),610-965(33022-4-3),966-1174(33022-4-4)\t4
33055\t-\t523\tPENDING\t8255\t待转扫\t1-147(33055-4-1),148-269(33055-4-
2),270-458(33055-4-3),459-538(33055-4-4)\t4`;

describe('parsePastedDispatchTable', () => {
  it('parses zones, sub-routes, volumes, scan IDs, and the batch ID', () => {
    const { routes, batchInfo } = parsePastedDispatchTable(SAMPLE, registry);

    expect(batchInfo.batchId).toBe('OSUB-202607072019');
    expect(batchInfo.totalVolume).toBe(465 + 577 + 1156 + 523);

    const nums = routes.map(r => r.routeNum);
    expect(nums).toContain('33011-2-1');
    expect(nums).toContain('33011-2-2');
    expect(nums).toContain('33012-3-3'); // survived the wrapped line
    expect(nums).toContain('33022-4-4');
    expect(nums).toContain('33055-4-1');
    expect(routes).toHaveLength(2 + 3 + 4 + 4);

    const r33011_1 = routes.find(r => r.routeNum === '33011-2-1')!;
    expect(r33011_1.orderVolume).toBe(253);
    expect(r33011_1.scanId).toBe('8257');
    expect(r33011_1.driverId).toBe('33011-2-1'); // placeholder until Auto-Assign

    const r33022_4 = routes.find(r => r.routeNum === '33022-4-4')!;
    expect(r33022_4.orderVolume).toBe(1174 - 966 + 1);
  });

  it('a wrapped allocation line is not mistaken for a new zone row', () => {
    const { routes } = parsePastedDispatchTable(SAMPLE, registry);
    // If "2),353-580(33012-3-3)" had split off, there would be a bogus row
    const zones = new Set(routes.map(r => r.routeNum.split('-')[0]));
    expect([...zones].sort()).toEqual(['33011', '33012', '33022', '33055']);
  });

  // The newer dashboard paginates (10 rows/page) and prints "0" in the DSP ID
  // column where the old one had a bare dash. Both pages get pasted into the
  // same box, one after the other, so the page footer/header lands mid-text.
  const PAGINATED = `Dispatch Planning

Back to plans
Plan Details - 20260815

OSUB-202608142056
Route Number\tDSP ID\tShipments\tScan#\tSplit Count\tDispatch Rule\tRoute Status\tReview Status\tAction
33011\t0\t483\t
8257\t2\t
1-256(19492),257-373(32108),374-483(18943)
Audited\tCompleted\t\t
33022\t0\t1012\t
8222\t4\t
1-200(20059),201-321(19526),322-586(4111),587-861(7409),862-1012(12569)
Audited\tCompleted\t\t
33024\t0\t515\t
8224\t2\t
1-120(31507),121-254(19524),255-384(3262),385-515(20063)
Audited\tCompleted\t\t
Rows per page:

10

1-10 of 18
Dispatch Planning

Back to plans
Plan Details - 20260815

OSUB-202608142056
Route Number\tDSP ID\tShipments\tScan#\tSplit Count\tDispatch Rule\tRoute Status\tReview Status\tAction
33025\t0\t377\t
8225\t2\t
1-190(29804),191-290(27905),291-377(27905)
Audited\tCompleted\t\t
33055\t0\t502\t
8255\t4\t
1-130(20135),131-261(15172),262-409(19995),410-502(19015)
Audited\tCompleted\t\t
Rows per page:

10

11-18 of 18`;

  it('reads the Shipments column when DSP ID prints 0 instead of a dash', () => {
    const { batchInfo } = parsePastedDispatchTable(PAGINATED, registry);
    // Taking the first number after the route would yield the DSP ID 0
    expect(batchInfo.totalVolume).toBe(483 + 1012 + 515 + 377 + 502);
    expect(batchInfo.batchId).toBe('OSUB-202608142056');
  });

  it('keeps both pasted pages, ignoring the pagination header/footer between them', () => {
    const { routes } = parsePastedDispatchTable(PAGINATED, registry);
    const zones = [...new Set(routes.map(r => r.routeNum.split('-')[0]))].sort();
    // "1-10 of 18" / "11-18 of 18" must not register as rows or segments
    expect(zones).toEqual(['33011', '33022', '33024', '33025', '33055']);
    expect(routes).toHaveLength(3 + 5 + 4 + 3 + 4);

    const first = routes.find(r => r.routeNum === '33011-1')!;
    expect(first.orderVolume).toBe(256);
    expect(first.scanId).toBe('8257');
    expect(first.driverId).toBe('19492'); // already-submitted table carries real IDs

    const last = routes.find(r => r.routeNum === '33055-4')!;
    expect(last.orderVolume).toBe(502 - 410 + 1);
    expect(last.scanId).toBe('8255');
  });

  it('throws a helpful error when no route rows are present', () => {
    expect(() => parsePastedDispatchTable('随便一段文字', registry)).toThrow(/33xxx/);
  });

  it('throws when route rows lack the allocation column', () => {
    expect(() => parsePastedDispatchTable('33011\t-\t465\tPENDING', registry)).toThrow(/预派发规则/);
  });
});
