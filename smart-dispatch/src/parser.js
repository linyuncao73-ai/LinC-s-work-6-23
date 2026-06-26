import { SCAN_ID_MAP, ZONE_NAMES, DEFAULT_TIME_SLOTS, resolveDriverId } from './defaults.js';

/**
 * Parse pasted table text from the YOW 取货表 / 预派发面板.
 *
 * Two layouts are supported:
 *
 *  (A) 取货表 row, where the last column lists sub-route keys:
 *      33011  569  PENDING  8257  1-308(33011-2-1), 309-569(33011-2-2)
 *      → each sub-route becomes a row; volume comes from the range size.
 *
 *  (B) 预派发面板 row, where the parens hold DRIVER IDs:
 *      33011  421  PENDING  8257  1-226(19492), 227-421(4574)
 *      → each segment becomes a row; volume from range, driver resolved.
 *
 *  (C) Simple "routeBase volume" with no sub-routes → one row.
 *
 * Returns an array of route objects ready for state.
 */
export function parsePaste(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];

  for (const line of lines) {
    const cols = line.includes('\t')
      ? line.split('\t').map(c => c.trim())
      : line.split(/\s{2,}/).map(c => c.trim());
    if (cols.length < 2) continue;

    // routeBase: 5-digit number starting with 3
    const routeBaseCol = cols.findIndex(c => /^3[0-9]{4}$/.test(c));
    if (routeBaseCol === -1) continue;
    const routeBase = cols[routeBaseCol];

    // Total volume: first reasonable integer after routeBase
    let totalVolume = 0;
    for (let i = routeBaseCol + 1; i < cols.length; i++) {
      const n = parseInt(cols[i].replace(/,/g, ''), 10);
      if (!isNaN(n) && n > 0 && n < 99999) { totalVolume = n; break; }
    }

    // scanId: 4-digit number starting with 8
    let scanId = SCAN_ID_MAP[routeBase] || '';
    for (const col of cols) {
      if (/^8[0-9]{3}$/.test(col)) { scanId = col; break; }
    }

    // Segments of the form "<start>-<end>(<token>)"  — token is a sub-route
    // key (contains a dash) or a driver id (digits only).
    const segPattern = /(\d+)\s*-\s*(\d+)\s*\(([^)]+)\)/g;
    const segments = [...line.matchAll(segPattern)];

    if (segments.length > 0) {
      segments.forEach((m, idx) => {
        const start = parseInt(m[1], 10);
        const end   = parseInt(m[2], 10);
        const token = m[3].trim();
        const vol   = Math.max(0, end - start + 1);

        if (/^3[0-9]{4}-/.test(token)) {
          // Layout A — token is a sub-route key, no driver
          results.push(makeRoute(token, routeBase, scanId, vol));
        } else {
          // Layout B — token is a driver id; synthesise a sub-route key
          const subKey = `${routeBase}-${idx + 1}`;
          const r = makeRoute(subKey, routeBase, scanId, vol);
          r.driverId = resolveDriverId(token);
          r.status = r.driverId ? 'assigned' : 'pending';
          results.push(r);
        }
      });
      continue;
    }

    // Plain sub-route keys without ranges, e.g. "33010-3-1, 33009-4-1"
    const keyMatches = [...line.matchAll(/\b(3[0-9]{4}-[\d.-]+)\b/g)].map(m => m[1]);
    if (keyMatches.length > 0 && totalVolume > 0) {
      const per = Math.round(totalVolume / keyMatches.length);
      keyMatches.forEach((key, i) => {
        const isLast = i === keyMatches.length - 1;
        results.push(makeRoute(key, routeBase, scanId, isLast ? totalVolume - per * i : per));
      });
      continue;
    }

    // Layout C — just routeBase + volume
    if (totalVolume > 0) {
      results.push(makeRoute(routeBase, routeBase, scanId, totalVolume));
    }
  }

  return results;
}

function makeRoute(routeKey, routeBase, scanId, orderVolume) {
  return {
    id: `${routeKey}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    routeKey,
    routeBase,
    scanId: scanId || SCAN_ID_MAP[routeBase] || '',
    zoneName: ZONE_NAMES[routeKey] || ZONE_NAMES[routeBase] || '',
    timeSlot: DEFAULT_TIME_SLOTS[routeBase] || '08:00 AM',
    orderVolume,
    status: 'pending',
    driverId: null,
    isSplitChild: false,
    splitParentId: null,
    notes: '',
  };
}

export { makeRoute };
