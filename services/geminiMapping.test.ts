// Node test for the Gemini-result → RouteData mapping (the part of the image
// parsing pipeline that runs in the browser after the Edge Function returns).
// Run:  node services/geminiMapping.test.ts
//
// This feeds a realistic mock of what the gemini-parse Edge Function returns
// (raw Gemini JSON) and verifies the frontend produces correct dispatch rows —
// proving the data flow end-to-end minus the actual Gemini API call.

import { mapImageResultToRoutes, parseAllocationSegments } from "./geminiMapping.ts";
import { INITIAL_DRIVER_REGISTRY } from "../types.ts";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label}`); }
}

// Mock raw Gemini result — mirrors the real 2026-06-23 取货表 (batch 11286).
const rawResult = {
  batchId: "OSUB-202606210303",
  date: "2026-06-23",
  rows: [
    // company drivers by ID
    { routeNum: "33011", totalVolume: 569, scanId: "8257",
      allocationString: "1-308(19492),309-569(4574)" },
    // sub-route placeholder keys (ident contains '-')
    { routeNum: "33055", totalVolume: 145, scanId: "8255",
      allocationString: "1-94(33055-4-1),95-179(33055-4-2)" },
    // no allocation string → single fallback row
    { routeNum: "33099", totalVolume: 120, scanId: "9999", allocationString: "" },
    // non-33 route → must be skipped
    { routeNum: "12345", totalVolume: 50, allocationString: "1-50(19492)" },
  ],
};

console.log("[1] parseAllocationSegments");
const segs = parseAllocationSegments("1-308(19492),309-569(4574)");
check("解析出 2 段", segs.length === 2);
check("第1段 start/end/ident", segs[0].start === 1 && segs[0].end === 308 && segs[0].ident === "19492");

console.log("\n[2] mapImageResultToRoutes — 公司司机号段");
const { routes, batchInfo } = mapImageResultToRoutes(rawResult, INITIAL_DRIVER_REGISTRY);
const r1 = routes.find(r => r.routeNum === "33011-1");
const r2 = routes.find(r => r.routeNum === "33011-2");
check("33011-1 → Fath(19492)", !!r1 && r1.driverId === "19492" && r1.driverName === "Fath");
check("33011-1 区域 = Kanata N", !!r1 && r1.routeLocation === "Kanata N");
check("33011-1 件数 = 308", !!r1 && r1.orderVolume === 308);
check("33011-1 扫单号 = 8257", !!r1 && r1.scanId === "8257");
check("33011-1 时间段 = 06:00 AM (默认表)", !!r1 && r1.timeSlot === "06:00 AM");
check("33011-2 → Sijiang(4574), 261件", !!r2 && r2.driverName === "Sijiang" && r2.orderVolume === 261);

console.log("\n[3] 子路线占位号段 (ident 含 '-')");
const sub = routes.find(r => r.routeNum === "33055-4-1");
check("33055-4-1 保留为 routeNum", !!sub);
check("33055-4-1 区域 = Renfrew (ZONE_NAMES[33055-1])", !!sub && sub.routeLocation === "Renfrew");
check("33055-4-1 件数 = 94", !!sub && sub.orderVolume === 94);
check("33055-4-1 driver 未分配", !!sub && sub.driverName === "Unassigned");

console.log("\n[4] 无拆分 → 单行回退 / 非33路线跳过");
const single = routes.find(r => r.routeNum === "33099");
check("33099 单行回退, 120件", !!single && single.orderVolume === 120);
check("12345 (非33) 被跳过", !routes.some(r => r.routeNum.startsWith("12345")));

console.log("\n[5] batchInfo");
check("批次号透传", batchInfo.batchId === "OSUB-202606210303");
check("日期透传", batchInfo.date === "2026-06-23");
check("总件数累加 = 569+145+120 = 834", batchInfo.totalVolume === 834);

console.log(`\n${"=".repeat(40)}\n结果: ${pass} 通过, ${fail} 失败\n${"=".repeat(40)}`);
process.exit(fail > 0 ? 1 : 0);
