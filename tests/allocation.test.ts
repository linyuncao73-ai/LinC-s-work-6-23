import { describe, it, expect } from 'vitest';
import { parseAllocationSegments } from '../services/geminiParser';
import { parseAllocation } from '../services/excelParser';

const REAL_SAMPLES = [
  {
    input: '1-157(33011-2-1),158-288(33011-2-2)',
    expected: [
      { start: 1, end: 157, ident: '33011-2-1' },
      { start: 158, end: 288, ident: '33011-2-2' },
    ],
  },
  {
    input: '1-125(33014-3-1),126-244(33014-3-2),245-355(33014-3-3)',
    expected: [
      { start: 1, end: 125, ident: '33014-3-1' },
      { start: 126, end: 244, ident: '33014-3-2' },
      { start: 245, end: 355, ident: '33014-3-3' },
    ],
  },
  {
    // 4-way split from real dashboard screenshot
    input: '1-215(33022-4-1),216-431(33022-4-2),432-633(33022-4-3),634-764(33022-4-4)',
    expected: [
      { start: 1, end: 215, ident: '33022-4-1' },
      { start: 216, end: 431, ident: '33022-4-2' },
      { start: 432, end: 633, ident: '33022-4-3' },
      { start: 634, end: 764, ident: '33022-4-4' },
    ],
  },
];

describe.each([
  ['geminiParser.parseAllocationSegments', parseAllocationSegments],
  ['excelParser.parseAllocation', parseAllocation],
])('%s', (_name, fn) => {
  it.each(REAL_SAMPLES)('parses $input', ({ input, expected }) => {
    expect(fn(input)).toEqual(expected);
  });

  it('handles driver-ID idents and whitespace', () => {
    expect(fn('1-22(20255), 23-50(15167)')).toEqual([
      { start: 1, end: 22, ident: '20255' },
      { start: 23, end: 50, ident: '15167' },
    ]);
  });

  it('returns empty for garbage', () => {
    expect(fn('')).toEqual([]);
    expect(fn('no segments here')).toEqual([]);
  });

  it('segment volumes sum correctly (end - start + 1)', () => {
    const segs = fn('1-157(33011-2-1),158-288(33011-2-2)');
    const total = segs.reduce((s: number, seg: any) => s + (seg.end - seg.start + 1), 0);
    expect(total).toBe(288);
  });
});
