import { describe, it, expect } from 'vitest';
import { applyFeedbackOps, FeedbackOp } from '../services/feedbackParser';
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
  it('single driver, no volume → just changes the driver, keeps team', () => {
    const routes = [mkRoute({ routeNum: '33029-3-3', orderVolume: 198 })];
    const ops: FeedbackOp[] = [{ routeNum: '33029-3-3', segments: [{ driverId: '19017', volume: null }] }];
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
      segments: [{ driverId: '18944', volume: 120 }, { driverId: '18943', volume: 67 }],
    }];
    const { routes: next, notes } = applyFeedbackOps(routes, ops, registry);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ routeNum: '33029-3-1', driverId: '18944', orderVolume: 120, isSplit: true });
    expect(next[1]).toMatchObject({ routeNum: '33029-3-1.1', driverId: '18943', orderVolume: 67, driverGroup: 'Alain' });
    expect(notes).toHaveLength(0);
  });

  it('segment sum ≠ total → last segment adjusted, note recorded', () => {
    const routes = [mkRoute({ orderVolume: 200 })];
    const ops: FeedbackOp[] = [{
      routeNum: '33029-3-1',
      segments: [{ driverId: '18944', volume: 120 }, { driverId: '18943', volume: 67 }],
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
      segments: [{ driverId: '18944', volume: 120 }, { driverId: '18943', volume: null }],
    }];
    const { routes: next } = applyFeedbackOps(routes, ops, registry);
    expect(next[1].orderVolume).toBe(67);
  });

  it('unknown routeNum is skipped with a note', () => {
    const routes = [mkRoute({})];
    const ops: FeedbackOp[] = [{ routeNum: '33099-9-9', segments: [{ driverId: '18944', volume: 100 }] }];
    const { routes: next, notes } = applyFeedbackOps(routes, ops, registry);
    expect(next).toHaveLength(1);
    expect(next[0].driverId).toBe('18944');
    expect(notes.some(n => n.includes('找不到'))).toBe(true);
  });

  it('re-applying feedback folds existing cut rows back first (idempotent)', () => {
    const base = mkRoute({ orderVolume: 120 });
    const child = mkRoute({ routeNum: '33029-3-1.1', orderVolume: 67, driverId: '18943', id: 'r-child', parentId: base.id });
    const ops: FeedbackOp[] = [{
      routeNum: '33029-3-1',
      segments: [{ driverId: '19997', volume: 100 }, { driverId: '32110', volume: 87 }],
    }];
    const { routes: next } = applyFeedbackOps([base, child], ops, registry);
    expect(next).toHaveLength(2); // old .1 replaced, not duplicated
    expect(next[0]).toMatchObject({ driverId: '19997', orderVolume: 100 });
    expect(next[1]).toMatchObject({ routeNum: '33029-3-1.1', driverId: '32110', orderVolume: 87 });
    expect(next.reduce((s, r) => s + r.orderVolume, 0)).toBe(187);
  });
});
