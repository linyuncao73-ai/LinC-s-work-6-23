import { describe, it, expect } from 'vitest';
import { parseFeedbackTextLocal, findTeamMismatches, CandidateRoute } from '../services/feedbackParser';
import { DriverRegistry } from '../types';

const mk = (routeNum: string, orderVolume = 300, driverGroup = 'Alain'): CandidateRoute =>
  ({ routeNum, orderVolume, driverId: '', driverGroup });

describe('parseFeedbackTextLocal — real broker reply styles', () => {
  it('Alain style: "18944  29-1  #120" with .1/.2 suffix folding and cut-only lines', () => {
    const candidates = [
      mk('33029-3-1'), mk('33029-3-2'), mk('33029-3-3'),
      mk('33050-3-1'), mk('33055-4-3'), mk('33055-4-4'), mk('33014-3-1'),
      // Company bases whose ".1" cuts belong to Alain — must still resolve
      mk('33015-2-1', 300, 'Company'), mk('33019-2-2', 300, 'Company'),
    ];
    const text = `
19994        14-1

5003303   15-1.1

32140       19-2.1

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

    expect(byRoute['33014-3-1']).toEqual([{ driverId: '19994', volume: null, partIdx: 0 }]);
    // The two previously-missed lines: cut-only mentions on company bases
    expect(byRoute['33015-2-1']).toEqual([{ driverId: '5003303', volume: null, partIdx: 1 }]);
    expect(byRoute['33019-2-2']).toEqual([{ driverId: '32140', volume: null, partIdx: 1 }]);
    expect(byRoute['33029-3-1']).toEqual([
      { driverId: '18944', volume: 120, partIdx: 0 },
      { driverId: '18943', volume: 67, partIdx: 1 },
    ]);
    expect(byRoute['33029-3-2']).toEqual([
      { driverId: '18943', volume: 50, partIdx: 0 },
      { driverId: '19997', volume: 120, partIdx: 1 },
      { driverId: '32110', volume: 36, partIdx: 2 },
    ]);
    expect(byRoute['33029-3-3']).toEqual([
      { driverId: '32110', volume: 78, partIdx: 0 },
      { driverId: '19017', volume: 120, partIdx: 1 },
    ]);
    expect(byRoute['33050-3-1']).toEqual([{ driverId: '19993', volume: null, partIdx: 0 }]);
    expect(byRoute['33055-4-3']).toEqual([{ driverId: '19995', volume: null, partIdx: 0 }]);
    expect(byRoute['33055-4-4']).toEqual([{ driverId: '18941', volume: null, partIdx: 0 }]);
  });

  it('Kaneza style: "22-1: 20059(190) to 12588(100)" renumbers unsuffixed segments', () => {
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
      { driverId: '20059', volume: 190, partIdx: 0 },
      { driverId: '12588', volume: 100, partIdx: 1 },
    ]);
    expect(byRoute['33022-4-3']).toEqual([
      { driverId: '19526', volume: 153, partIdx: 0 },
      { driverId: '2900', volume: 50, partIdx: 1 },
      { driverId: '7411', volume: 153, partIdx: 2 },
    ]);
    expect(byRoute['33022-4-4']).toEqual([{ driverId: '19523', volume: null, partIdx: 0 }]);
    expect(byRoute['33026-3-1']).toEqual([{ driverId: '19525', volume: null, partIdx: 0 }]);
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
      { driverId: '28715', volume: 135, partIdx: 0 },
      { driverId: '27891', volume: 148, partIdx: 1 },
    ]);
    expect(byRoute['33019-2-1']).toEqual([{ driverId: '29155', volume: null, partIdx: 1 }]);
    expect(byRoute['33030-3-3']).toEqual([{ driverId: '5002460', volume: 114, partIdx: 0 }]);
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
      { driverId: '19749', volume: 150, partIdx: 0 },
      { driverId: '23606', volume: null, partIdx: 1 },
    ]);
    expect(byRoute['33050-3-2']).toEqual([{ driverId: '30913', volume: null, partIdx: 0 }]);
    expect(byRoute['33055-4-1']).toEqual([{ driverId: '20135', volume: null, partIdx: 0 }]);
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
      { driverId: '15165', volume: 147, partIdx: 0 },
      { driverId: '15173', volume: 148, partIdx: 1 },
    ]);
    expect(byRoute['33050-3-3']).toEqual([{ driverId: '15172', volume: 188, partIdx: 0 }]);
  });

  it('Alawi lazy split: same route number twice = base + first cut', () => {
    // The broker split a route into two but labeled BOTH halves "33018-1"
    // instead of "33018-1" + "33018-1.1". Repeated same-route mentions must
    // fold into sequential split segments.
    const candidates = [mk('33018-2-1', 300, 'Alawi'), mk('33020-2-1', 300, 'Alawi'), mk('33050-3-3', 300, 'Alawi'), mk('33055-4-2', 300, 'Alawi')];
    const text = `*ALAWI* | 07/21/2026 | OSUB-202607192026

📍 *8218*
• 15171 @ 06:00 AM (#33018-1) [Orleans E] [100]
• 15173 @ 06:00 AM (#33018-1) [Orleans E] [97]

📍 *8220*
• 15168 @ 06:00 AM (#33020-1) [Aylmer E] [99]
• ⁠15166 @ 06:00 AM (#33020-1) [Aylmer E] [100]

📍 *8250*
• 15172 @ 06:00 AM (#33050-3) [Calton Place] [124]

📍 *8255*
• 15165 @ 06:00 AM (#33055-2) [Perth] [141]

*Sum:* 4 Routes / 661 items

Tomorrow's routes, thanks`;
    const ops = parseFeedbackTextLocal(text, candidates);
    const byRoute = Object.fromEntries(ops.map(o => [o.routeNum, o.segments]));

    expect(byRoute['33018-2-1']).toEqual([
      { driverId: '15171', volume: 100, partIdx: 0 },
      { driverId: '15173', volume: 97, partIdx: 1 },
    ]);
    expect(byRoute['33020-2-1']).toEqual([
      { driverId: '15168', volume: 99, partIdx: 0 },
      { driverId: '15166', volume: 100, partIdx: 1 },
    ]);
    expect(byRoute['33050-3-3']).toEqual([{ driverId: '15172', volume: 124, partIdx: 0 }]);
    expect(byRoute['33055-4-2']).toEqual([{ driverId: '15165', volume: 141, partIdx: 0 }]);
  });

  it('returns [] for unmatched text so the AI fallback kicks in', () => {
    expect(parseFeedbackTextLocal('明天正常，都可以', [mk('33029-3-1')])).toEqual([]);
    expect(parseFeedbackTextLocal('', [mk('33029-3-1')])).toEqual([]);
  });
});

describe('findTeamMismatches — 中介只改自己的线', () => {
  const registry: DriverRegistry = {
    '4574': { name: 'Sijiang', group: 'Company' },
    '19995': { name: 'Alain Team', group: 'Alain' },
    '19994': { name: 'Alain Team', group: 'Alain' },
    '5003303': { name: 'Alain Team', group: 'Alain' },
  };
  // 33011 拆 2 份：-1 是 Alain 的，-2 是公司司机 Sijiang 的
  const routes = [
    { routeNum: '33011-2-1', driverId: '19995', driverGroup: 'Alain' },
    { routeNum: '33011-2-2', driverId: '4574', driverGroup: 'Company' },
    { routeNum: '33017-3-2', driverId: '19994', driverGroup: 'Alain' },
  ];

  it('flags a main-segment hit on a company route and points at the broker own line', () => {
    // Alain 打成了 "19994 11-2"，实际想说 11-1
    const ops = [{ routeNum: '33011-2-2', segments: [{ driverId: '19994', volume: null, partIdx: 0 }] }];
    const bad = findTeamMismatches(ops, routes, registry);
    expect(bad).toHaveLength(1);
    expect(bad[0].currentTeam).toBe('Company');
    expect(bad[0].currentDriverId).toBe('4574');
    expect(bad[0].suggestRouteNum).toBe('33011-2-1');
  });

  it('offers no suggestion when the reply already covers the right line', () => {
    // 中介后面自己更正了：11-2 和 11-1 都在同一段反馈里
    const ops = [
      { routeNum: '33011-2-2', segments: [{ driverId: '19994', volume: null, partIdx: 0 }] },
      { routeNum: '33011-2-1', segments: [{ driverId: '19994', volume: null, partIdx: 0 }] },
    ];
    const bad = findTeamMismatches(ops, routes, registry);
    expect(bad.map(m => m.routeNum)).toEqual(['33011-2-2']);
    expect(bad[0].suggestRouteNum).toBeNull();
  });

  it('leaves a ".n" cut on a company base alone — that is how cutting works', () => {
    const ops = [{ routeNum: '33011-2-2', segments: [{ driverId: '5003303', volume: null, partIdx: 1 }] }];
    expect(findTeamMismatches(ops, routes, registry)).toEqual([]);
  });

  it('leaves the broker own routes alone', () => {
    const ops = [{ routeNum: '33017-3-2', segments: [{ driverId: '5003303', volume: null, partIdx: 0 }] }];
    expect(findTeamMismatches(ops, routes, registry)).toEqual([]);
  });
});
