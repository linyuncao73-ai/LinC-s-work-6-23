// Minimal node test — verifies allocator + parser + real sample data.
// Run: node test-allocator.mjs

import { autoAllocate, generateAllocationRanges, generateAgencyMessage, agenciesWithRoutes } from './src/allocator.js';
import { parsePaste, makeRoute } from './src/parser.js';
import { SAMPLE_ROUTES, DEFAULT_ASSIGNMENTS, DEFAULT_DRIVERS, AGENCY_MEMBERS, resolveDriverId, FIXED_AGENCY_VAN, agencyRouteKey } from './src/defaults.js';

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label}`); }
}

// ── 1. Real sample data sanity ────────────────────────────────────────────────
console.log('\n[1] 真实样例数据 (2026-06-23 取货表)');
const totalSample = SAMPLE_ROUTES.reduce((s, r) => s + r.orderVolume, 0);
console.log(`  子路线数: ${SAMPLE_ROUTES.length}  总件数: ${totalSample}`);
check('49 条子路线', SAMPLE_ROUTES.length === 49);
check('总件数在合理范围 (11000-11500)', totalSample > 11000 && totalSample < 11500);
// Each main route's sub-routes sum check (33022 = 341+331+344+205 = 1221)
const r33022 = SAMPLE_ROUTES.filter(r => r.routeBase === '33022').reduce((s, r) => s + r.orderVolume, 0);
check('33022 子路线合计 = 1221', r33022 === 1221);
const r33011 = SAMPLE_ROUTES.filter(r => r.routeBase === '33011').reduce((s, r) => s + r.orderVolume, 0);
check('33011 子路线合计 = 569', r33011 === 569);

// ── 2. Driver ID resolution ───────────────────────────────────────────────────
console.log('\n[2] 司机号解析 (公司号保留 / 中介成员号→团队)');
check('19492 (Fath) → 19492', resolveDriverId('19492') === '19492');
check('18944 (Alain 成员) → Alain', resolveDriverId('18944') === 'Alain');
check('15165 (Alawi 成员) → Alawi', resolveDriverId('15165') === 'Alawi');
check('20059 (Kaneza 成员) → Kaneza', resolveDriverId('20059') === 'Kaneza');
check('30907 (Chris 成员) → Chris', resolveDriverId('30907') === 'Chris');
check('29155 (Parfait 成员) → Parfait', resolveDriverId('29155') === 'Parfait');
check('未知号 → null', resolveDriverId('99999') === null);

// ── 3. Parser: 预派发面板格式 (range(driverId)) ────────────────────────────────
console.log('\n[3] Parser — 预派发面板格式 (括号内是司机号)');
const panelText = '33011\t421\tPENDING\t8257\t1-226(19492), 227-421(4574)';
const parsed = parsePaste(panelText);
check('解析出 2 条', parsed.length === 2);
check('第1段 226 件 → Fath(19492)', parsed[0].orderVolume === 226 && parsed[0].driverId === '19492');
check('第2段 195 件 → Sijiang(4574)', parsed[1].orderVolume === 195 && parsed[1].driverId === '4574');
const panelAgency = '33029\t480\tPENDING\t8229\t1-144(18944), 145-332(19015), 333-480(19995)';
const parsedAg = parsePaste(panelAgency);
check('中介行：3 段全部解析为 Alain', parsedAg.length === 3 && parsedAg.every(r => r.driverId === 'Alain'));

// ── 4. Parser: 取货表格式 (range(subRouteKey)) ─────────────────────────────────
console.log('\n[4] Parser — 取货表格式 (括号内是子路线号)');
const pickText = '33012\t613\tPENDING\t8258\t1-194(33012-3-1), 195-409(33012-3-2), 410-613(33012-3-3)';
const parsedPick = parsePaste(pickText);
check('解析出 3 条子路线', parsedPick.length === 3);
check('子路线号正确', parsedPick[0].routeKey === '33012-3-1' && parsedPick[2].routeKey === '33012-3-3');
check('件数来自区间 (194/215/204)', parsedPick[0].orderVolume === 194 && parsedPick[1].orderVolume === 215 && parsedPick[2].orderVolume === 204);

// ── 5. Smart allocation on real data ──────────────────────────────────────────
console.log('\n[5] 智能分配 — 真实样例 (48 子路线, ~11286 件)');
const routes = SAMPLE_ROUTES.map((r, i) => ({ id: 'r' + i, routeKey: r.routeKey, orderVolume: r.orderVolume }));
const result = autoAllocate(routes, DEFAULT_DRIVERS);
const assignedCount = Object.keys(result.assignments).length;
console.log(`  已分配: ${assignedCount}/${routes.length}  公司:${result.stats.companyAssigned} 中介:${result.stats.agencyAssigned} 未分配:${result.stats.unassigned} 警告:${result.warnings.length}`);
check('分配率 ≥ 90% (贪心在紧运力下允许少量碎片)', (result.stats.companyAssigned + result.stats.agencyAssigned) / totalSample >= 0.9);
check('公司+中介总运力 ≥ 总件数', (result.stats.totalCompanyCap + result.stats.totalAgencyCap) >= totalSample);

// ── 6. Default assignment coverage ────────────────────────────────────────────
console.log('\n[6] 默认司机分配映射');
const assignedKeys = Object.keys(DEFAULT_ASSIGNMENTS).length;
const allResolve = Object.values(DEFAULT_ASSIGNMENTS).every(id => DEFAULT_DRIVERS.some(d => d.id === id));
console.log(`  映射条数: ${assignedKeys}`);
check('所有默认分配的司机号都在司机列表中', allResolve);
check('覆盖全部 49 条样例', SAMPLE_ROUTES.every(r => DEFAULT_ASSIGNMENTS[r.routeKey]));

// ── 7. 权威数据对齐校验 ────────────────────────────────────────────────────────
console.log('\n[7] 与权威 types.ts 对齐');
check('33030-4-4 → Parfait (非 2218)', DEFAULT_ASSIGNMENTS['33030-4-4'] === 'Parfait');
check('33022 时间段 = 08:00 AM', parsePaste('33022\t100\t8222\t1-100(20059)')[0].timeSlot === '08:00 AM');
check('33011 时间段 = 06:00 AM', parsePaste('33011\t100\t8257\t1-100(19492)')[0].timeSlot === '06:00 AM');

// ── 8. Ammar 解散 / 司机转岗 ───────────────────────────────────────────────────
console.log('\n[8] Ammar 解散，13456/12572 转公司司机');
const d13456 = DEFAULT_DRIVERS.find(d => d.id === '13456');
const d12572 = DEFAULT_DRIVERS.find(d => d.id === '12572');
check('13456 (Ammar) 现为公司司机', d13456 && !d13456.isAgency && d13456.group === 'Company');
check('12572 (Nada) 现为公司司机', d12572 && !d12572.isAgency && d12572.group === 'Company');
check('Ammar 团队桶已移除', !DEFAULT_DRIVERS.some(d => d.id === 'Ammar'));
check('AGENCY_MEMBERS 中无残留 Ammar', !Object.values(AGENCY_MEMBERS).includes('Ammar'));
check('27862 → Parfait', resolveDriverId('27862') === 'Parfait');
check('33015-2-2 默认 → 13456 (公司)', DEFAULT_ASSIGNMENTS['33015-2-2'] === '13456');
check('33017-2-1 默认 → 12572 (公司)', DEFAULT_ASSIGNMENTS['33017-2-1'] === '12572');

// ── 9. Excel 排单范围生成 ──────────────────────────────────────────────────────
console.log('\n[9] 排单范围生成 (start-end(driverId) 累计区间)');
const sampleRoutes = SAMPLE_ROUTES.map((r, i) => {
  const did = DEFAULT_ASSIGNMENTS[r.routeKey];
  return { id: 'r' + i, routeKey: r.routeKey, routeBase: r.routeBase, scanId: '', orderVolume: r.orderVolume, driverId: did || null };
});
const allocRanges = generateAllocationRanges(sampleRoutes, DEFAULT_DRIVERS);
const alloc11 = allocRanges.find(r => r.base === '33011');
check('33011 → "1-308(19492),309-569(4574)"', alloc11 && alloc11.text === '1-308(19492),309-569(4574)');
check('33011 累计总量 = 569', alloc11 && alloc11.total === 569);
const alloc22 = allocRanges.find(r => r.base === '33022');
check('33022 标记含中介线 (hasAgency)', alloc22 && alloc22.hasAgency === true);
check('生成 18 条主路线范围', allocRanges.length === 18);
const alloc22text = alloc22.text;
check('33022 中介线导出用具体车号 (20059)', alloc22text.includes('(20059)') && alloc22text.includes('(4111)'));

// ── 10. 中介群发消息 ───────────────────────────────────────────────────────────
console.log('\n[10] 中介 WhatsApp 群发消息');
// Build full routes (scanId/zone/time) from sample + default assignment
const fullRoutes = SAMPLE_ROUTES.map(r => {
  const route = makeRoute(r.routeKey, r.routeBase, '', r.orderVolume);
  const did = DEFAULT_ASSIGNMENTS[r.routeKey];
  if (did) { route.driverId = did; route.status = 'assigned'; }
  return route;
});
const agencies = agenciesWithRoutes(fullRoutes, DEFAULT_DRIVERS);
check('Ammar 不在中介群发列表 (已解散)', !agencies.includes('Ammar'));
check('Kaneza/Alain/Alawi/Chris/Parfait 都有路线', ['Kaneza','Alain','Alawi','Chris','Parfait'].every(a => agencies.includes(a)));

const kanezaMsg = generateAgencyMessage(fullRoutes, DEFAULT_DRIVERS, 'Kaneza', { batchId: 'OSUB-202606240442', date: '2026-06-25' });
console.log('  ── Kaneza 消息预览 ──');
console.log(kanezaMsg.text.split('\n').map(l => '    ' + l).join('\n'));
check('表头含 KANEZA + 日期 + 批次', kanezaMsg.text.startsWith('KANEZA | 06/25/2026 | OSUB-202606240442'));
check('用具体车号 20059 而非团队名', kanezaMsg.text.includes('* 20059 @'));
check('线号转为中介格式 #33022-1', kanezaMsg.text.includes('(#33022-1)'));
check('含区域 [Gatineau W]', kanezaMsg.text.includes('[Gatineau W]'));
check('含 Sum 行', /Sum: \d+ Routes \/ \d+ items/.test(kanezaMsg.text));
check('agencyRouteKey 33022-4-1 → 33022-1', agencyRouteKey('33022-4-1') === '33022-1');

// ── 11. 中介推荐 / 比例分配 ────────────────────────────────────────────────────
console.log('\n[11] 超运力时按比例推荐中介');
const { recommendOverflowSplit, agencyCapacityReport } = await import('./src/allocator.js');
const split = recommendOverflowSplit(2000, DEFAULT_DRIVERS);
console.log('  2000 件溢出 → ' + split.map(s => `${s.id}:${s.suggested}`).join(', '));
check('Kaneza 分得最多', split[0].id === 'Kaneza');
check('分配总和 ≈ 2000', Math.abs(split.reduce((s, x) => s + x.suggested, 0) - 2000) <= 5);
check('5001743 → Alain', resolveDriverId('5001743') === 'Alain');
check('32097 → Alain', resolveDriverId('32097') === 'Alain');
const kanezaCap = DEFAULT_DRIVERS.find(d => d.id === 'Kaneza');
check('Kaneza 运力上限 = 4500', kanezaCap.maxCapacity === 4500);
const totalAgencyCap = DEFAULT_DRIVERS.filter(d => d.isAgency).reduce((s, d) => s + d.maxCapacity, 0);
check('中介总上限 ≥ 13000 (能接爆单溢出)', totalAgencyCap >= 13000);

console.log(`\n${'='.repeat(40)}\n结果: ${pass} 通过, ${fail} 失败\n${'='.repeat(40)}`);
process.exit(fail > 0 ? 1 : 0);
