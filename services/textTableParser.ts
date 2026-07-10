import { RouteData, BatchInfo, DriverRegistry, getOttawaTomorrowDateString } from "../types";
import { parseAllocationSegments, buildRoutesFromRows, DispatchRow } from "./geminiParser";

/**
 * Parses text copied straight off the dispatch dashboard (select the table,
 * Ctrl+C, paste). Pure rules — instant, offline, immune to AI outages.
 *
 * A copied row looks roughly like:
 *   33011  -  465  PENDING  8257  待转扫  1-253(33011-2-1),254-473(33011-2-2)  2
 * possibly spread across several lines when the allocation column wraps.
 */
export function parsePastedDispatchTable(
  text: string,
  registry: DriverRegistry
): { routes: RouteData[]; batchInfo: BatchInfo } {
  const cleaned = text.replace(/[​-‍⁠﻿]/g, '');

  // Split into one chunk per zone row, anchored on a bare 33xxx route number
  // at the start of a line. "(?![\d-])" keeps wrapped allocation lines like
  // "33014-3-2),245-355(...)" from being mistaken for a new row.
  const chunks = cleaned.split(/\n(?=\s*33\d{3}(?![\d-]))/).map(c => c.trim()).filter(Boolean);

  const rows: DispatchRow[] = [];
  for (const chunk of chunks) {
    const m = chunk.match(/^33\d{3}(?![\d-])/);
    if (!m) continue;
    const routeNum = m[0];
    const rest = chunk.slice(routeNum.length);

    // 货量: first standalone number after the route number (commas allowed).
    // Skip bare dashes from the empty 团队 ID column.
    const volMatch = rest.match(/(\d{1,3}(?:,\d{3})+|\d+)/);
    const totalVolume = volMatch ? parseInt(volMatch[1].replace(/,/g, '')) : 0;

    const scanMatch = chunk.match(/\b(8\d{3})\b/);
    const segments = parseAllocationSegments(chunk);

    rows.push({
      routeNum,
      totalVolume,
      scanId: scanMatch ? scanMatch[1] : undefined,
      segments,
    });
  }

  if (rows.length === 0) {
    throw new Error('没有识别到任何 33xxx 路线行。请在取货表网页上框选整个表格（包含路线号和预派发规则列）后复制，再粘贴到这里。');
  }
  if (rows.every(r => r.segments.length === 0)) {
    throw new Error('识别到路线行，但没有读到预派发规则（如 "1-253(33011-2-1)"）。请确认复制范围包含"预派发规则"这一列。');
  }

  const displayDate = getOttawaTomorrowDateString();
  const batchMatch = cleaned.match(/OSUB-\d+/);

  return {
    routes: buildRoutesFromRows(rows, registry, displayDate, 'TXT'),
    batchInfo: {
      date: displayDate,
      batchId: batchMatch ? batchMatch[0] : ('TXT-IMPORT-' + Date.now()),
      totalVolume: rows.reduce((s, r) => s + r.totalVolume, 0),
    },
  };
}