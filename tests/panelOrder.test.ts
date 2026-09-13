import { describe, it, expect } from 'vitest';
import { DRIVER_PANEL_ORDER, INITIAL_DRIVER_REGISTRY, REMOVED_DRIVER_IDS } from '../types';

// The availability panel is read down this list, so a company driver missing
// from it silently drops to the end — which is how a returning driver ended up
// stranded there before. Object key order can't be used: driver ids are
// integer-like, so a plain object is always walked in numeric order.
describe('DRIVER_PANEL_ORDER', () => {
  it('covers every company driver on the roster', () => {
    const company = Object.entries(INITIAL_DRIVER_REGISTRY)
      .filter(([id, d]) => d.group === 'Company' && !REMOVED_DRIVER_IDS.includes(id))
      .map(([id]) => id);
    const missing = company.filter(id => !DRIVER_PANEL_ORDER.includes(id));
    expect(missing).toEqual([]);
  });

  it('lists nobody twice and nobody who has left', () => {
    expect(DRIVER_PANEL_ORDER).toHaveLength(new Set(DRIVER_PANEL_ORDER).size);
    expect(DRIVER_PANEL_ORDER.filter(id => REMOVED_DRIVER_IDS.includes(id))).toEqual([]);
  });

  it('starts at Fath and keeps the part-timers last', () => {
    expect(DRIVER_PANEL_ORDER[0]).toBe('19492');
    expect(DRIVER_PANEL_ORDER.slice(-2)).toEqual(['12412', '14214']);
  });

  it('puts Abdikader between Amin Abdi and Saleh', () => {
    const i = DRIVER_PANEL_ORDER.indexOf('2218');
    expect(DRIVER_PANEL_ORDER[i - 1]).toBe('5847');
    expect(DRIVER_PANEL_ORDER[i + 1]).toBe('3978');
  });
});
