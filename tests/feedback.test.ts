import { describe, it, expect } from 'vitest';
import { applyFeedbackOps, collectUnknownDrivers, FeedbackOp } from '../services/feedbackParser';
import { RouteData, DriverRegistry } from '../types';

const registry: DriverRegistry = {
  '18944': { name: 'Alain Team', group: 'Alain' },
  '18943': { name: 'Alain Team', group: 'Alain' },
  '19997': { name: 'Alain Team', group: 'Alain' },
  '32110': { name: 'Alain Team', group: 'Alain' },
};

const mkRoute = (over: Partial<RouteData>): RouteData => ({
  id: 'r-' + over.routeNum,
  routeNum: '33029-3-1',
  driver: 'Alain Team',
  driverId: '18944',
  driverName: 'Alain Team',
  driverGroup: 'Alain',
  routeLocation: 'Nepean E',
  timeSlot: '08:00 AM',
  orderVolume: 187,
  scanId: '8229',
  ...over,
});

describe('applyFeedbackOps', () => {
  it('single driver, no volume → just changes the driver, keeps team and volume', () => {
    const routes = [mkRoute({ routeNum: '33029-3-3', orderVolume: 198 })];
    const ops: FeedbackOp[] = [{ routeNum: '33029-3-3', segments: [{ driverId: '19017', volume: null, partIdx: 0 }] }];
    const { routes: next, notes } = applyFeedbackOps(routes, ops, registry);
    expect(next).toHaveLength(1);
    expect(next[0].driverId).toBe('19017');
    expect(next[0].driverGroup).toBe('Alain'); // unknown ID stays in broker team
    expect(next[0].orderVolume).toBe(198);
    expect(notes).toHaveLength(0);
  });

  it('two segments summing to the total → two rows with .1 numbering', () => {
    const routes = [mkRoute({ routeNum: '33029-3-1', orderVolume: 187 })];
    const ops: FeedbackOp[] = [{
      routeNum: '33029-3-1',
      segments: [{ driverId: '18944', volume: 120, partIdx: 0 }, { driverId: '18943', volume: 67, partIdx: 1 }],
    }];
    const { routes: next, notes } = applyFeedbackOps(routes, ops, registry);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ routeNum: '33029-3-1', driverId: '18944', orderVolume: 120, isSplit: true });
    expect(next[1]).toMatchObject({ routeNum: '33029-3-1.1', driverId: '18943', orderVolume: 67, driverGroup: 'Alain' });
    expect(notes).toHaveLength(0);
  });

  it('segment sum ≠ total → last explicit segment adjusted, note recorded', () => {
    const routes = [mkRoute({ orderVolume: 200 })];
    const ops: FeedbackOp[] = [{
      routeNum: '33029-3-1',
      segments: [{ driverId: '18944', volume: 120, partIdx: 0 }, { driverId: '18943', volume: 67, partIdx: 1 }],
    }];
    const { routes: next, notes } = applyFeedbackOps(routes, ops, registry);
    expect(next[0].orderVolume).toBe(120);
    expect(next[1].orderVolume).toBe(80); // 67 + 13 correction
    expect(notes.some(n => n.includes('调整'))).toBe(true);
    expect(next.reduce((s, r) => s + r.orderVolume, 0)).toBe(200);
  });

  it('null segment among fixed ones takes the remainder', () => {
    const routes = [mkRoute({ orderVolume: 187 })];
    const ops: FeedbackOp[] = [{
      routeNum: '33029-3-1',
      segments: [{ driverId: '18944', volume: 120, partIdx: 0 }, { driverId: '18943', volume: null, partIdx: 1 }],
    }];
    const { routes: next } = applyFeedbackOps(routes, ops, registry);
    expect(next[1].orderVolume).toBe(67);
  });

  it('unknown routeNum is skipped with a note', () => {
    const routes = [mkRoute({})];
    const ops: FeedbackOp[] = [{ routeNum: '33099-9-9', segments: [{ driverId: '18944', volume: 100, partIdx: 0 }] }];
    const { routes: next, notes } = applyFeedbackOps(routes, ops, registry);
    expect(next).toHaveLength(1);
    expect(next[0].driverId).toBe('18944');
    expect(notes.some(n => n.includes('找不到'))).toBe(true);
  });

  it('collectUnknownDrivers reports new IDs with their route team, deduped', () => {
    const routes = [
      mkRoute({ routeNum: '33029-3-1' }),
      mkRoute({ routeNum: '33022-4-1', driverGroup: 'Kaneza' }),
    ];
    const ops: FeedbackOp[] = [
      { routeNum: '33029-3-1', segments: [{ driverId: '18944', volume: 120, partIdx: 0 }, { driverId: '99999', volume: 67, partIdx: 1 }] },
      { routeNum: '33022-4-1', segments: [{ driverId: '12588', volume: 100, partIdx: 0 }, { driverId: '99999', volume: null, partIdx: 1 }] },
    ];
    const unknowns = collectUnknownDrivers(ops, routes, registry);
    expect(unknowns).toEqual([
      { id: '99999', group: 'Alain' }, // first occurrence wins the team
      { id: '12588', group: 'Kaneza' },
    ]);
  });

  it('re-applying feedback updates existing cut rows in place (idempotent)', () => {
    const base = mkRoute({ orderVolume: 120 });
    const child = mkRoute({ routeNum: '33029-3-1.1', orderVolume: 67, driverId: '18943', id: 'r-child', parentId: base.id });
    const ops: FeedbackOp[] = [{
      routeNum: '33029-3-1',
      segments: [{ driverId: '19997', volume: 100, partIdx: 0 }, { driverId: '32110', volume: 87, partIdx: 1 }],
    }];
    const { routes: next } = applyFeedbackOps([base, child], ops, registry);
    expect(next).toHaveLength(2); // old .1 replaced, not duplicated
    expect(next[0]).toMatchObject({ driverId: '19997', orderVolume: 100 });
    expect(next[1]).toMatchObject({ routeNum: '33029-3-1.1', driverId: '32110', orderVolume: 87 });
    expect(next.reduce((s, r) => s + r.orderVolume, 0)).toBe(187);
  });

  it('a cut-only mention updates just that part, leaving the company base row alone', () => {
    // Real case: "5003303 15-1.1" — the base 33015-2-1 belongs to a company
    // driver; only the ".1" cut was given to Alain.
    const base = mkRoute({ routeNum: '33015-2-1', driverId: '12699', driverName: 'Shebani', driverGroup: 'Company', orderVolume: 250 });
    const child = mkRoute({ routeNum: '33015-2-1.1', id: 'r-cut', driverId: '32140', driverGroup: 'Alain', orderVolume: 67, parentId: base.id });
    const other = mkRoute({ routeNum: '33029-3-1' });
    const ops: FeedbackOp[] = [{
      routeNum: '33015-2-1',
      segments: [{ driverId: '5003303', volume: null, partIdx: 1 }],
    }];
    const { routes: next, notes } = applyFeedbackOps([base, child, other], ops, registry);
    expect(next).toHaveLength(3);
    const nextBase = next.find(r => r.routeNum === '33015-2-1')!;
    const nextCut = next.find(r => r.routeNum === '33015-2-1.1')!;
    expect(nextBase).toMatchObject({ driverId: '12699', orderVolume: 250, driverGroup: 'Company' }); // untouched
    expect(nextCut).toMatchObject({ driverId: '5003303', orderVolume: 67, driverGroup: 'Alain' }); // team from the cut row
    expect(notes).toHaveLength(0);
  });

  it('a cut-only mention with volume creates the missing part and keeps the total', () => {
    const base = mkRoute({ routeNum: '33019-2-2', driverId: '18844', driverGroup: 'Company', orderVolume: 200 });
    const ops: FeedbackOp[] = [{
      routeNum: '33019-2-2',
      segments: [{ driverId: '32140', volume: 60, partIdx: 1 }],
    }];
    const { routes: next, notes } = applyFeedbackOps([base], ops, registry);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ routeNum: '33019-2-2', driverId: '18844', orderVolume: 140 }); // base carved down
    expect(next[1]).toMatchObject({ routeNum: '33019-2-2.1', driverId: '32140', orderVolume: 60 });
    expect(notes.some(n => n.includes('调整'))).toBe(true);
    expect(next.reduce((s, r) => s + r.orderVolume, 0)).toBe(200);
  });
});
