import { describe, it, expect } from 'vitest';
import { normalizeEbinderDate, ebinderDateMatchesBatchDate, getOffDriverIds, EbinderData } from '../types';

describe('normalizeEbinderDate', () => {
  it('parses the formats seen on real e-binder sheets', () => {
    expect(normalizeEbinderDate('7-5')).toEqual({ m: 7, d: 5 });
    expect(normalizeEbinderDate('7.5')).toEqual({ m: 7, d: 5 });
    expect(normalizeEbinderDate('07-05')).toEqual({ m: 7, d: 5 });
    expect(normalizeEbinderDate('0705')).toEqual({ m: 7, d: 5 });
    expect(normalizeEbinderDate('0705 off')).toEqual({ m: 7, d: 5 });
    expect(normalizeEbinderDate('7.5 off')).toEqual({ m: 7, d: 5 });
    expect(normalizeEbinderDate('6.23 off')).toEqual({ m: 6, d: 23 });
    expect(normalizeEbinderDate('0704 of')).toEqual({ m: 7, d: 4 });
  });

  it('rejects things that are not dates', () => {
    expect(normalizeEbinderDate('off')).toBeNull();
    expect(normalizeEbinderDate('')).toBeNull();
    expect(normalizeEbinderDate('休')).toBeNull();
  });

  it('rejects out-of-range month/day values', () => {
    expect(normalizeEbinderDate('13-40')).toBeNull();
    expect(normalizeEbinderDate('9999')).toBeNull();
  });
});

describe('ebinderDateMatchesBatchDate', () => {
  it('matches across formats against MM/DD/YYYY batch dates', () => {
    expect(ebinderDateMatchesBatchDate('7-5', '07/05/2026')).toBe(true);
    expect(ebinderDateMatchesBatchDate('0705 off', '07/05/2026')).toBe(true);
    expect(ebinderDateMatchesBatchDate('7.5 off', '07/05/2026')).toBe(true);
    expect(ebinderDateMatchesBatchDate('7-6', '07/05/2026')).toBe(false);
    expect(ebinderDateMatchesBatchDate('Route 1.1', '07/05/2026')).toBe(false);
  });
});

describe('getOffDriverIds', () => {
  const ebinder: EbinderData = {
    weekDates: ['7-6', '7-7', '7-8'],
    parsedAt: Date.now(),
    drivers: [
      { driverId: '5528', driverName: 'Ben', maxCapacity: 230, offDates: ['7-6'] },
      { driverId: '19492', driverName: 'Fath', maxCapacity: 300, offDates: [] },
      { driverId: '26133', driverName: 'Mostafa', maxCapacity: null, offDates: ['7-6', '7-7', '7-8'] },
    ],
  };

  it('returns only drivers off on the batch date', () => {
    const off = getOffDriverIds(ebinder, '07/06/2026');
    expect(off.has('5528')).toBe(true);
    expect(off.has('26133')).toBe(true);
    expect(off.has('19492')).toBe(false);
  });

  it('returns empty set for a date nobody is off', () => {
    const off = getOffDriverIds(ebinder, '07/09/2026');
    expect(off.size).toBe(0);
  });
});
