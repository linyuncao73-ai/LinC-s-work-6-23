import { describe, it, expect } from 'vitest';
import { getHoldSuggestions } from '../services/holdSuggestions';
import { RouteData } from '../types';

function route(partial: Partial<RouteData>): RouteData {
  return {
    id: partial.id || Math.random().toString(36).slice(2),
    driver: '', routeNum: '', routeLocation: '', timeSlot: '06:00 AM',
    orderVolume: 0, scanId: '',
    ...partial,
  } as RouteData;
}

describe('getHoldSuggestions', () => {
  it('suggests holding a remote zone at or below its threshold', () => {
    const routes = [
      route({ id: 'a', routeNum: '33050-3-1', routeLocation: 'Brookville', orderVolume: 98 }),
      route({ id: 'b', routeNum: '33011-2-1', routeLocation: 'Kanata N', orderVolume: 50 }),
    ];
    const s = getHoldSuggestions(routes);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ label: 'Brookville', routeIds: ['a'], volume: 98, threshold: 120 });
  });

  it('threshold is inclusive (以下含本数) and above-threshold is quiet', () => {
    const at = getHoldSuggestions([route({ routeNum: '33050-3-1', routeLocation: 'Brookville', orderVolume: 120 })]);
    expect(at).toHaveLength(1);
    const above = getHoldSuggestions([route({ routeNum: '33050-3-1', routeLocation: 'Brookville', orderVolume: 121 })]);
    expect(above).toHaveLength(0);
  });

  it('covers all four single zones with their own thresholds', () => {
    const routes = [
      route({ routeNum: '33050-3-3', routeLocation: 'Calton Place', orderVolume: 100 }),
      route({ routeNum: '33055-4-1', routeLocation: 'Renfrew', orderVolume: 99 }),
      route({ routeNum: '33055-4-2', routeLocation: 'Perth', orderVolume: 101 }), // above → no
    ];
    const labels = getHoldSuggestions(routes).map(s => s.label).sort();
    expect(labels).toEqual(['Calton Place', 'Renfrew']);
  });

  it('combines 55-3 and 55-4 against the 150 threshold', () => {
    const low = getHoldSuggestions([
      route({ id: 'x', routeNum: '33055-4-3', routeLocation: 'R-G', orderVolume: 80 }),
      route({ id: 'y', routeNum: '33055-4-4', routeLocation: 'M-M-R-E', orderVolume: 60 }),
    ]);
    expect(low).toHaveLength(1);
    expect(low[0]).toMatchObject({ label: '55-3 + 55-4', volume: 140, threshold: 150 });
    expect(low[0].routeIds.sort()).toEqual(['x', 'y']);

    const high = getHoldSuggestions([
      route({ routeNum: '33055-4-3', routeLocation: 'R-G', orderVolume: 90 }),
      route({ routeNum: '33055-4-4', routeLocation: 'M-M-R-E', orderVolume: 90 }),
    ]);
    expect(high).toHaveLength(0);
  });

  it('falls back to routeNum → ZONE_NAMES when the location cell was cleared', () => {
    const s = getHoldSuggestions([route({ routeNum: '33055-4-1', routeLocation: '', orderVolume: 50 })]);
    expect(s.map(x => x.label)).toEqual(['Renfrew']);
  });

  it('skips already-held routes and zero-volume rows', () => {
    const s = getHoldSuggestions([
      route({ routeNum: '33050-3-1', routeLocation: 'Brookville', orderVolume: 98, isHold: true }),
      route({ routeNum: '33055-4-2', routeLocation: 'Perth', orderVolume: 0 }),
    ]);
    expect(s).toHaveLength(0);
  });
});
