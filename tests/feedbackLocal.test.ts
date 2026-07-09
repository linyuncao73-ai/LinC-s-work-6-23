import { describe, it, expect } from 'vitest';
import { parseFeedbackTextLocal, CandidateRoute } from '../services/feedbackParser';

const mk = (routeNum: string, orderVolume = 300): CandidateRoute =>
  ({ routeNum, orderVolume, driverId: '', driverGroup: 'Alain' });

describe('parseFeedbackTextLocal — real broker reply styles', () => {
  it('Alain style: "18944  29-1  #120" with .1/.2 suffix folding', () => {
    const candidates = [mk('33029-3-1'), mk('33029-3-2'), mk('33029-3-3'), mk('33050-3-1'), mk('33055-4-3'), mk('33055-4-4'), mk('33014-3-1'), mk('33015-2-1'), mk('33019-2-2')];
    const text = `
19994        14-1

18944        29-1    #120

18943        29-1.1  #67

18943       29-2      #50

19997      29-2.1    #120

32110     29-2.2   #36

32110    29-3   #78

19017    29-3.1  #120

19993    50-1

19995    55-3

18941    55-4
`;
    const ops = parseFeedbackTextLocal(text, candidates);
    const byRoute = Object.fromEntries(ops.map(o => [o.routeNum, o.segments]));

    expect(byRoute['33014-3-1']).toEqual([{ driverId: '19994', volume: null }]);
    expect(byRoute['33029-3-1']).toEqual([
      { driverId: '18944', volume: 120 },
      { driverId: '18943', volume: 67 },
    ]);
    expect(byRoute['33029-3-2']).toEqual([
      { driverId: '18943', volume: 50 },
      { driverId: '19997', volume: 120 },
      { driverId: '32110', volume: 36 },
    ]);
    expect(byRoute['33029-3-3']).toEqual([
      { driverId: '32110', volume: 78 },
      { driverId: '19017', volume: 120 },
    ]);
    expect(byRoute['33050-3-1']).toEqual([{ driverId: '19993', volume: null }]);
    expect(byRoute['33055-4-3']).toEqual([{ driverId: '19995', volume: null }]);
    expect(byRoute['33055-4-4']).toEqual([{ driverId: '18941', volume: null }]);
  });

  it('Kaneza style: "22-1: 20059(190) to 12588(100)" and bare-driver lines', () => {
    const candidates = [mk('33022-4-1'), mk('33022-4-2'), mk('33022-4-3'), mk('33022-4-4'), mk('33024-2-1'), mk('33024-2-2'), mk('33026-3-1')];
    const text = `Some changes
22-1: 20059(190) to 12588(100)
22-2: 4111(209) to 18924(110)
22-3: 19526(153),2900(50),7411(153)
22-4: 19523
24-1: 18926(100),19524(90),20061(90)
26-1: 19525`;
    const ops = parseFeedbackTextLocal(text, candidates);
    const byRoute = Object.fromEntries(ops.map(o => [o.routeNum, o.segments]));

    expect(byRoute['33022-4-1']).toEqual([
      { driverId: '20059', volume: 190 },
      { driverId: '12588', volume: 100 },
    ]);
    expect(byRoute['33022-4-3']).toEqual([
      { driverId: '19526', volume: 153 },
      { driverId: '2900', volume: 50 },
      { driverId: '7411', volume: 153 },
    ]);
    expect(byRoute['33022-4-4']).toEqual([{ driverId: '19523', volume: null }]);
    expect(byRoute['33026-3-1']).toEqual([{ driverId: '19525', volume: null }]);
  });

  it('Parfait style: "28715-33018-2. 135pkges"', () => {
    const candidates = [mk('33018-2-2'), mk('33019-2-1'), mk('33025-2-1'), mk('33030-3-3')];
    const text = `parfait
28715-33018-2.      135pkges
27891-33018-2.1.    148pkges
29155-33019-1.1
5002460-33030-3.    114pkges`;
    const ops = parseFeedbackTextLocal(text, candidates);
    const byRoute = Object.fromEntries(ops.map(o => [o.routeNum, o.segments]));

    expect(byRoute['33018-2-2']).toEqual([
      { driverId: '28715', volume: 135 },
      { driverId: '27891', volume: 148 },
    ]);
    expect(byRoute['33030-3-3']).toEqual([{ driverId: '5002460', volume: 114 }]);
  });

  it('Christ style: "Driver ID 19749: 33020 - 2 (1 - 150)"', () => {
    const candidates = [mk('33020-2-2'), mk('33050-3-2'), mk('33055-4-1')];
    const text = `Christ
Driver ID 19749: 33020 - 2 (1 - 150)
Driver ID 23606: 33020 - 2.1
Driver ID 30913: 33050 - 2
Driver ID 20135: 33055 - 1`;
    const ops = parseFeedbackTextLocal(text, candidates);
    const byRoute = Object.fromEntries(ops.map(o => [o.routeNum, o.segments]));

    expect(byRoute['33020-2-2']).toEqual([
      { driverId: '19749', volume: 150 },
      { driverId: '23606', volume: null },
    ]);
    expect(byRoute['33050-3-2']).toEqual([{ driverId: '30913', volume: null }]);
    expect(byRoute['33055-4-1']).toEqual([{ driverId: '20135', volume: null }]);
  });

  it('Alawi style: our own report format echoed back', () => {
    const candidates = [mk('33018-2-1'), mk('33020-2-1'), mk('33050-3-3'), mk('33055-4-2')];
    const text = `*ALAWI* | 07/09/2026 | OSUB-202607072019

📍 *8218*
• 15165 @ 06:00 AM (#33018-1) [Orleans E] [147]
• ⁠15173 @ 06:00 AM (#33018-1.1) [Orleans E] [148]

📍 *8250*
• 15172 @ 06:00 AM (#33050-3) [Calton Place] [188]

*Sum:* 4 Routes / 865 items

Tomorrow's routes, thanks`;
    const ops = parseFeedbackTextLocal(text, candidates);
    const byRoute = Object.fromEntries(ops.map(o => [o.routeNum, o.segments]));

    expect(byRoute['33018-2-1']).toEqual([
      { driverId: '15165', volume: 147 },
      { driverId: '15173', volume: 148 },
    ]);
    expect(byRoute['33050-3-3']).toEqual([{ driverId: '15172', volume: 188 }]);
  });

  it('returns [] for unmatched text so the AI fallback kicks in', () => {
    expect(parseFeedbackTextLocal('明天正常，都可以', [mk('33029-3-1')])).toEqual([]);
    expect(parseFeedbackTextLocal('', [mk('33029-3-1')])).toEqual([]);
  });
});
