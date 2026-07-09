import { describe, it, expect } from 'vitest';
import { normalizeEbinderDate, ebinderDateMatchesBatchDate, getOffDriverIds, weekdayOfBatchDate, partitionRegistry, EbinderData } from '../types';

describe('partitionRegistry', () => {
  it('splits temp and permanent entries', () => {
    const { permanent, temp } = partitionRegistry({
      '19492': { name: 'Fath', group: 'Company' },
      '12588': { name: 'Kaneza Team', group: 'Kaneza', temp: true },
      '13456': { name: 'Ammar', group: 'Company', edited: true },
    });
    expect(Object.keys(permanent).sort()).toEqual(['13456', '19492']);
    expect(Object.keys(temp)).toEqual(['12588']);
  });

  it('handles an empty registry', () => {
    expect(partitionRegistry({})).toEqual({ permanent: {}, temp: {} });
  });
});

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

describe('weekdayOfBatchDate', () => {
  it('maps MM/DD/YYYY to JS weekday numbers', () => {
    expect(weekdayOfBatchDate('07/10/2026')).toBe(5); // Friday
    expect(weekdayOfBatchDate('07/12/2026')).toBe(0); // Sunday
    expect(weekdayOfBatchDate('07/06/2026')).toBe(1); // Monday
    expect(weekdayOfBatchDate('garbage')).toBeNull();
  });
});

describe('fixed weekly days off (red cells)', () => {
  const ebinder: EbinderData = {
    weekDates: ['7-6', '7-7', '7-8', '7-9', '7-10', '7-11', '7-12'],
    parsedAt: Date.now(),
    drivers: [
      // Hamal: red on Friday → fixed Friday off
      { driverId: '13952', driverName: 'Hamal', maxCapacity: null, offDates: [], fixedOffWeekdays: [5] },
      // Saiki: red Monday + Tuesday
      { driverId: '18843', driverName: 'Saiki', maxCapacity: 300, offDates: [], fixedOffWeekdays: [1, 2] },
      // Ammar: one-time text "0710 off", no fixed days
      { driverId: '13456', driverName: 'Ammar', maxCapacity: 250, offDates: ['7-10'], fixedOffWeekdays: [] },
      // Fath: works every day
      { driverId: '19492', driverName: 'Fath', maxCapacity: 300, offDates: [], fixedOffWeekdays: [] },
    ],
  };

  it('marks fixed-off drivers on their weekday (Friday 07/10)', () => {
    const off = getOffDriverIds(ebinder, '07/10/2026');
    expect(off.has('13952')).toBe(true);  // fixed Friday
    expect(off.has('13456')).toBe(true);  // one-time text 7-10
    expect(off.has('18843')).toBe(false); // fixed Mon/Tue only
    expect(off.has('19492')).toBe(false);
  });

  it('does not mark them on other weekdays (Thursday 07/09)', () => {
    const off = getOffDriverIds(ebinder, '07/09/2026');
    expect(off.size).toBe(0);
  });

  it('fixed weekdays keep working the NEXT week without re-upload', () => {
    const off = getOffDriverIds(ebinder, '07/17/2026'); // next Friday
    expect(off.has('13952')).toBe(true);
    expect(off.has('13456')).toBe(false); // one-time 7-10 no longer matches
  });

  it('Saiki is off on Mondays', () => {
    const off = getOffDriverIds(ebinder, '07/13/2026'); // Monday
    expect(off.has('18843')).toBe(true);
  });
});
