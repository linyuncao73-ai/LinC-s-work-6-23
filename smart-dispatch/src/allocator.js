import { FIXED_AGENCY_VAN, agencyRouteKey, resolveDriverId, AGENCY_SHARE } from './defaults.js';

/**
 * Smart dispatch allocation — greedy tightest-fit decreasing.
 *
 * Strategy:
 *   1. Sort routes by volume DESC (large routes first = better bin packing)
 *   2. For each route, find the company driver with LEAST remaining capacity
 *      that can still fit the route. (Tightest fit avoids leaving tiny gaps
 *      that waste capacity.)
 *   3. If no company driver fits, try agency drivers (same logic).
 *   4. If nobody fits: flag as overflow / needs-split.
 *
 * Splits are NOT done automatically — the UI lets the user manually split
 * a route into two parts after seeing the allocation suggestion.
 */
export function autoAllocate(routes, drivers) {
  const activeCompany = drivers.filter(d => !d.isAgency && d.active);
  const activeAgency  = drivers.filter(d =>  d.isAgency && d.active);

  // remaining[driverId] = packages still available today
  const remaining = {};
  [...activeCompany, ...activeAgency].forEach(d => { remaining[d.id] = d.maxCapacity; });

  // Sort routes largest-first for packing efficiency
  const sorted = [...routes].sort((a, b) => b.orderVolume - a.orderVolume);

  const assignments = {};   // routeId → driverId
  const warnings    = [];   // { type, routeId, routeKey, volume, message }

  for (const route of sorted) {
    const vol = route.orderVolume;

    // --- 1. Try company drivers: tightest fit ---
    const companyFit = activeCompany
      .filter(d => remaining[d.id] >= vol)
      .sort((a, b) => remaining[a.id] - remaining[b.id]); // ascending = tightest first

    if (companyFit.length > 0) {
      assignments[route.id] = companyFit[0].id;
      remaining[companyFit[0].id] -= vol;
      continue;
    }

    // --- 2. Try agency drivers: same logic ---
    const agencyFit = activeAgency
      .filter(d => remaining[d.id] >= vol)
      .sort((a, b) => remaining[a.id] - remaining[b.id]);

    if (agencyFit.length > 0) {
      assignments[route.id] = agencyFit[0].id;
      remaining[agencyFit[0].id] -= vol;
      continue;
    }

    // --- 3. Can't fit anywhere — recommend the agency with the most room left ---
    const rec = activeAgency
      .slice()
      .sort((a, b) => remaining[b.id] - remaining[a.id])[0];
    const recMsg = rec ? ` 建议交给 ${rec.id}（还可接 ${remaining[rec.id]} 件）` : '';

    const maxSingle = Math.max(...[...activeCompany, ...activeAgency].map(d => d.maxCapacity), 0);
    if (vol > maxSingle && maxSingle > 0) {
      warnings.push({
        type: 'needs-split',
        routeId: route.id,
        routeKey: route.routeKey,
        volume: vol,
        recommend: rec?.id || null,
        message: `${route.routeKey} (${vol}件) 超过单司机最大运力 (${maxSingle}件)，需要拆单${recMsg}`,
      });
    } else {
      warnings.push({
        type: 'overflow',
        routeId: route.id,
        routeKey: route.routeKey,
        volume: vol,
        recommend: rec?.id || null,
        message: `${route.routeKey} (${vol}件) 无法分配：公司+中介运力已用尽${recMsg}`,
      });
    }
  }

  // --- Summary stats ---
  const totalVol       = routes.reduce((s, r) => s + r.orderVolume, 0);
  const totalCompanyCap = activeCompany.reduce((s, d) => s + d.maxCapacity, 0);
  const totalAgencyCap  = activeAgency.reduce((s, d) => s + d.maxCapacity, 0);

  const companyAssigned = Object.entries(assignments)
    .filter(([, did]) => activeCompany.some(d => d.id === did))
    .reduce((s, [rid]) => s + (routes.find(r => r.id === rid)?.orderVolume ?? 0), 0);

  const agencyAssigned = Object.entries(assignments)
    .filter(([, did]) => activeAgency.some(d => d.id === did))
    .reduce((s, [rid]) => s + (routes.find(r => r.id === rid)?.orderVolume ?? 0), 0);

  // Check which company drivers went over (shouldn't happen, but guard)
  const overCapDrivers = activeCompany.filter(d => {
    const used = d.maxCapacity - remaining[d.id];
    return used > d.maxCapacity;
  });

  // Estimate how much more agency capacity is needed
  const unassigned = totalVol - companyAssigned - agencyAssigned;

  return {
    assignments,
    warnings,
    stats: {
      totalVol,
      totalCompanyCap,
      totalAgencyCap,
      companyAssigned,
      agencyAssigned,
      unassigned,
      remaining,
      overCapDrivers,
      needsAgency: Math.max(0, totalVol - totalCompanyCap),
    },
  };
}

// ─── Agency capacity report & overflow recommendation ────────────────────────
// Per-agency view: how much each agency is already carrying vs its typical cap.
export function agencyCapacityReport(routes, drivers) {
  const agencies = drivers.filter(d => d.isAgency);
  return agencies.map(a => {
    const assigned = routes
      .filter(r => r.driverId === a.id)
      .reduce((s, r) => s + r.orderVolume, 0);
    return {
      id: a.id,
      cap: a.maxCapacity,
      assigned,
      remaining: a.maxCapacity - assigned,
      active: a.active,
    };
  }).sort((x, y) => y.remaining - x.remaining);
}

// Recommend how to spread an overflow volume across agencies by their typical
// share (Kaneza biggest). Returns [{ id, suggested }] sorted largest first.
export function recommendOverflowSplit(overflowVolume, drivers) {
  const active = drivers.filter(d => d.isAgency && d.active);
  const totalShare = active.reduce((s, d) => s + (AGENCY_SHARE[d.id] || d.maxCapacity), 0);
  if (totalShare === 0 || overflowVolume <= 0) return [];
  return active
    .map(d => ({
      id: d.id,
      suggested: Math.round(overflowVolume * (AGENCY_SHARE[d.id] || d.maxCapacity) / totalShare),
    }))
    .filter(x => x.suggested > 0)
    .sort((a, b) => b.suggested - a.suggested);
}

// ─── Excel allocation ranges ──────────────────────────────────────────────────
// Reproduces the existing tool's "Excel Allocation Ranges" output: for each
// route base, the assigned sub-routes are laid out as cumulative parcel ranges
// "start-end(driverId)" — e.g. 33011 with [308→19492, 261→4574] becomes
// "1-308(19492),309-569(4574)". This text is copy-pasted into the
// password-protected final chart (which can't be linked directly).
function sortRouteKeyLocal(a, b) {
  const parse = k => k.split(/[-.]/).map(n => parseFloat(n) || 0);
  const pa = parse(a), pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

export function generateAllocationRanges(routes, drivers) {
  const driverMap = {};
  drivers.forEach(d => { driverMap[d.id] = d; });

  const byBase = {};
  routes.filter(r => r.driverId).forEach(r => {
    (byBase[r.routeBase] ||= []).push(r);
  });

  return Object.keys(byBase).sort().map(base => {
    const subs = byBase[base].slice().sort((a, b) => sortRouteKeyLocal(a.routeKey, b.routeKey));
    let cursor = 1;
    const segs = subs.map(r => {
      const start = cursor;
      const end = cursor + r.orderVolume - 1;
      cursor = end + 1;
      // Company drivers export their real ID. Agency lines export their default
      // van ID (so the output matches the existing tool); falls back to the team
      // name if no default van is on record for that line.
      const d = driverMap[r.driverId];
      let label = r.driverId;
      if (d?.isAgency) {
        const van = FIXED_AGENCY_VAN[r.routeKey];
        label = (van && resolveDriverId(van) === r.driverId) ? van : r.driverId;
      }
      return `${start}-${end}(${label})`;
    });
    return {
      base,
      scanId: subs[0].scanId,
      total: cursor - 1,
      text: segs.join(','),
      hasAgency: subs.some(r => driverMap[r.driverId]?.isAgency),
    };
  });
}

// ─── WhatsApp agency messages ─────────────────────────────────────────────────
// Builds the per-agency message sent the night before, e.g.:
//   KANEZA | 06/25/2026 | OSUB-202606240442
//
//   📍 8222
//   * 20059 @ 08:00 AM (#33022-1) [Gatineau W] [170]
//   ...
//   Sum: 7 Routes / 1601 items
//
//   Tomorrow's routes, thanks
function fmtDate(dateStr) {
  // YYYY-MM-DD → MM/DD/YYYY
  const [y, m, d] = dateStr.split('-');
  return y && m && d ? `${m}/${d}/${y}` : dateStr;
}

export function generateAgencyMessage(routes, drivers, agencyName, { batchId = '', date = '' } = {}) {
  const driverMap = {};
  drivers.forEach(d => { driverMap[d.id] = d; });

  // Routes assigned to this agency team bucket
  const mine = routes.filter(r => r.driverId === agencyName);
  if (mine.length === 0) return null;

  // Group by scan ID
  const byScan = {};
  mine.forEach(r => { (byScan[r.scanId || '—'] ||= []).push(r); });

  const lines = [`${agencyName.toUpperCase()} | ${fmtDate(date)} | ${batchId}`, ''];
  let totalVol = 0, routeCount = 0;

  Object.keys(byScan).sort().forEach(scan => {
    lines.push(`📍 ${scan}`);
    byScan[scan]
      .slice()
      .sort((a, b) => agencyRouteKey(a.routeKey).localeCompare(agencyRouteKey(b.routeKey)))
      .forEach(r => {
        const van = FIXED_AGENCY_VAN[r.routeKey];
        const id = (van && resolveDriverId(van) === agencyName) ? van : agencyName;
        const zone = r.zoneName ? ` [${r.zoneName}]` : '';
        lines.push(`* ${id} @ ${r.timeSlot || '08:00 AM'} (#${agencyRouteKey(r.routeKey)})${zone} [${r.orderVolume}]`);
        totalVol += r.orderVolume;
        routeCount++;
      });
    lines.push('');
  });

  lines.push(`Sum: ${routeCount} Routes / ${totalVol} items`);
  lines.push('');
  lines.push("Tomorrow's routes, thanks");
  return { agencyName, text: lines.join('\n'), routeCount, totalVol };
}

// All agencies that currently have at least one assigned route
export function agenciesWithRoutes(routes, drivers) {
  const set = new Set();
  const agencyIds = new Set(drivers.filter(d => d.isAgency).map(d => d.id));
  routes.forEach(r => { if (agencyIds.has(r.driverId)) set.add(r.driverId); });
  return [...set];
}

// Per-driver capacity summary for the UI capacity bars
export function driverUsage(routes, drivers) {
  const usage = {};
  drivers.forEach(d => { usage[d.id] = 0; });
  routes.forEach(r => {
    if (r.driverId && usage[r.driverId] !== undefined) {
      usage[r.driverId] += r.orderVolume;
    }
  });
  return usage; // driverId → total packages assigned
}
