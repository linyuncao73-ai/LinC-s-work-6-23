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

  it('throws a helpful error when no route rows are present', () => {
    expect(() => parsePastedDispatchTable('随便一段文字', registry)).toThrow(/33xxx/);
  });

  it('throws when route rows lack the allocation column', () => {
    expect(() => parsePastedDispatchTable('33011\t-\t465\tPENDING', registry)).toThrow(/预派发规则/);
  });
});
