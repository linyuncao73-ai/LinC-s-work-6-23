import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { RouteData, DriverRegistry } from "../types";
import { getApiKey } from "./apiKey";
import { generateWithRetry } from "./geminiClient";

/** partIdx 0 = the base row; n = the ".n" cut row of that base. */
export interface FeedbackSegment { driverId: string; volume: number | null; partIdx: number }
export interface FeedbackOp { routeNum: string; segments: FeedbackSegment[] }

export interface CandidateRoute {
  routeNum: string;
  orderVolume: number;
  driverId: string;
  driverGroup: string;
}

// ---------------------------------------------------------------------------
// Local (deterministic) parser — instant, offline, no AI quota. Handles the
// five reply styles seen in the field; the AI parser below is the fallback
// for anything it can't read.
// ---------------------------------------------------------------------------

interface RawEntry { driverId: string; routeToken: string; volume: number | null }

/** "29-2.1" → { base: "29-2", segIdx: 1 }; "33020-2" → { base: "33020-2", segIdx: 0 } */
function splitSegSuffix(token: string): { base: string; segIdx: number } {
  const m = token.match(/^(.*?)\.(\d+)$/);
  if (m) return { base: m[1], segIdx: parseInt(m[2]) };
  return { base: token, segIdx: 0 };
}

/** Resolves shorthand like "29-2", "33018-1", "33022-4-1" to a candidate routeNum. */
function resolveRoute(baseToken: string, candidates: CandidateRoute[]): string | null {
  const parts = baseToken.split('-').filter(p => p !== '');
  if (parts.length < 2) return null;
  const tokMajor = parts[0];
  const tokSub = parts[parts.length - 1];
  for (const c of candidates) {
    if (c.routeNum === baseToken) return c.routeNum;
    const cp = c.routeNum.split('-');
    const cMajor = cp[0];
    const cSub = cp[cp.length - 1];
    const majorMatch = cMajor === tokMajor || (tokMajor.length >= 2 && cMajor.endsWith(tokMajor));
    if (majorMatch && cSub === tokSub) {
      // 3-part tokens must also match the middle part
      if (parts.length >= 3 && cp.length >= 3 && parts[1] !== cp[1]) continue;
      return c.routeNum;
    }
  }
  return null;
}

const cleanRouteToken = (s: string) => s.replace(/\s+/g, '').replace(/\.+$/, '');

function parseLine(line: string): RawEntry[] {
  // WhatsApp copies often carry invisible characters (word joiners, ZWSP)
  const t = line.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/^[•\-\*\s]+/, '').trim();
  if (!t || /^(sum|total|tomorrow|thanks|some changes|driver id\s*$)/i.test(t)) return [];

  // Christ: "Driver ID 19749: 33020 - 2 (1 - 150)"
  let m = t.match(/^Driver\s*ID\s*(\d{3,7})\s*[:：]\s*([\d\s\-.]+?)(?:\((\d+)\s*-\s*(\d+)\))?\s*$/i);
  if (m) {
    const vol = m[3] !== undefined ? parseInt(m[4]) - parseInt(m[3]) + 1 : null;
    return [{ driverId: m[1], routeToken: cleanRouteToken(m[2]), volume: vol }];
  }

  // Our own report format echoed back: "• 15165 @ 06:00 AM (#33018-1) [Orleans E] [147]"
  m = t.match(/^(\d{3,7})\s*@[^(]*\(#\s*([\d\-. ]+)\)(.*)$/);
  if (m) {
    const volMatches = [...(m[3] || '').matchAll(/\[(\d+)\]/g)];
    const vol = volMatches.length > 0 ? parseInt(volMatches[volMatches.length - 1][1]) : null;
    return [{ driverId: m[1], routeToken: cleanRouteToken(m[2]), volume: vol }];
  }

  // Kaneza: "22-1: 20059(190) to 12588(100)" / "22-3: a(x),b(y),c(z)" / "22-4: 19523"
  m = t.match(/^([\d\s\-.]+?)\s*[:：]\s*(.+)$/);
  if (m && /^\d/.test(m[1])) {
    const routeToken = cleanRouteToken(m[1]);
    const rhs = m[2];
    const entries: RawEntry[] = [];
    for (const seg of rhs.matchAll(/(\d{3,7})\s*(?:\(\s*(\d+)\s*\))?/g)) {
      entries.push({ driverId: seg[1], routeToken, volume: seg[2] !== undefined ? parseInt(seg[2]) : null });
    }
    return entries;
  }

  // Parfait: "28715-33018-2. 135pkges" / "29155-33019-1.1"
  m = t.match(/^(\d{4,7})\s*-\s*(33[\d\-. ]+?)\.?\s*(?:(\d+)\s*pk?ge?s?)?\s*$/i);
  if (m) {
    return [{ driverId: m[1], routeToken: cleanRouteToken(m[2]), volume: m[3] !== undefined ? parseInt(m[3]) : null }];
  }

  // Alain / generic: "18944  29-1  #120" / "19994 14-1" / "18944 29-1 120件"
  m = t.match(/^(\d{3,7})\s+([\d\-. ]+?)(?:\s*[#＃]\s*(\d+)|\s+(\d+)\s*件)?\s*$/);
  if (m && m[2].includes('-')) {
    const vol = m[3] !== undefined ? parseInt(m[3]) : m[4] !== undefined ? parseInt(m[4]) : null;
    return [{ driverId: m[1], routeToken: cleanRouteToken(m[2]), volume: vol }];
  }

  return [];
}

/** Deterministic parse of the whole reply. Returns [] when nothing matched. */
export function parseFeedbackTextLocal(text: string, candidates: CandidateRoute[]): FeedbackOp[] {
  const grouped = new Map<string, { segIdx: number; order: number; seg: Omit<FeedbackSegment, 'partIdx'> }[]>();
  let order = 0;
  for (const line of text.split(/\r?\n/)) {
    for (const entry of parseLine(line)) {
      const { base, segIdx } = splitSegSuffix(entry.routeToken);
      const routeNum = resolveRoute(base, candidates);
      if (!routeNum) continue;
      if (!grouped.has(routeNum)) grouped.set(routeNum, []);
      grouped.get(routeNum)!.push({ segIdx, order: order++, seg: { driverId: entry.driverId, volume: entry.volume } });
    }
  }
  const ops: FeedbackOp[] = [];
  for (const [routeNum, items] of grouped) {
    items.sort((a, b) => a.segIdx - b.segIdx || a.order - b.order);
    // Styles without ".n" suffixes (e.g. Kaneza "22-3: a(x),b(y),c(z)") list
    // several segments under the same index — renumber them sequentially so
    // they re-slice the whole base. Suffixed styles keep their part numbers.
    const idxs = items.map(i => i.segIdx);
    const hasDuplicates = new Set(idxs).size !== idxs.length;
    ops.push({
      routeNum,
      segments: items.map((i, pos) => ({ ...i.seg, partIdx: hasDuplicates ? pos : i.segIdx })),
    });
  }
  return ops;
}

/**
 * Parses a broker's free-form WhatsApp reply into structured assignments.
 * Every broker writes differently; the prompt teaches the model the real
 * styles seen in the field and forces every output onto a candidate route.
 */
export async function parseBrokerFeedback(
  text: string,
  candidateRoutes: CandidateRoute[]
): Promise<FeedbackOp[]> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const routeList = candidateRoutes
    .map(r => `${r.routeNum} (current driver ${r.driverId || 'none'}, ${r.orderVolume} parcels, team ${r.driverGroup})`)
    .join('\n');

  const prompt = `
    You are parsing a delivery broker's WhatsApp reply that assigns drivers to routes.

    CURRENT ROUTE TABLE (the only valid targets — every assignment you output
    MUST use one of these exact routeNum values as its base):
    ${routeList}

    THE BROKER'S REPLY:
    ---
    ${text}
    ---

    Produce assignments: for each BASE route mentioned, the ordered list of
    {driverId, volume} segments the broker wants.

    HOW TO READ THE REPLY (brokers all write differently):
    - Route shorthand: "22-1" means the route in the table matching 33022-…-1
      (e.g. "33022-4-1"). "29-2" matches 33029-…-2. "33020 - 2" (with spaces)
      means 33020-…-2. Always resolve to an exact routeNum from the table.
    - SUFFIX FOLDING: entries like "29-2 #50", "29-2.1 #120", "29-2.2 #36"
      are ONE base route (33029-…-2) split into 3 ordered segments:
      [{50}, {120}, {36}]. The ".1"/".2" suffixes are cut parts, not separate
      table routes. Same for "33018-2" + "33018-2.1" etc.
    - Volume notations (all mean parcel count): "(190)", "#120", "[147]",
      "135pkges", "135 pkges", "(1 - 150)" = a range meaning 150 parcels.
    - "A(190) to B(100)": two segments — driver A keeps 190, driver B takes 100.
    - "Driver ID 19749: 33020 - 2 (1 - 150)": driver 19749, base 33020-…-2,
      volume 150.
    - "28715-33018-2. 135pkges": driver 28715 first, then route, then volume.
    - Driver + route with NO volume: volume = null (whole line, or the
      remainder of that base route).
    - A line like "• 15165 @ 06:00 AM (#33018-1) [Orleans E] [147]": driver
      15165, base route 33018-…-1, volume 147.
    - Ignore greetings, team names, dates, "Sum:" lines, and anything that
      isn't a driver-route assignment.

    Output every base route mentioned exactly once, with its segments in the
    order they appear in the reply.
  `;

  const response: GenerateContentResponse = await generateWithRetry(ai, {
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      temperature: 0,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          assignments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                routeNum: { type: Type.STRING, description: "Exact base routeNum from the table, e.g. '33029-3-2'" },
                segments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      driverId: { type: Type.STRING, description: "Numeric driver ID" },
                      volume:   { type: Type.NUMBER, description: "Parcel count for this segment; omit if not stated" }
                    },
                    required: ["driverId"]
                  }
                }
              },
              required: ["routeNum", "segments"]
            }
          }
        },
        required: ["assignments"]
      }
    }
  });

  const raw = JSON.parse(response.text || "{}");
  const validRouteNums = new Set(candidateRoutes.map(r => r.routeNum));

  const ops: FeedbackOp[] = (raw.assignments || [])
    .map((a: any) => ({
      routeNum: String(a.routeNum || '').trim(),
      segments: (Array.isArray(a.segments) ? a.segments : [])
        .map((s: any, i: number) => ({
          driverId: String(s.driverId || '').replace(/\D/g, ''),
          volume: typeof s.volume === 'number' && s.volume > 0 ? Math.round(s.volume) : null,
          partIdx: i,
        }))
        .filter((s: FeedbackSegment) => s.driverId !== ''),
    }))
    .filter((op: FeedbackOp) => validRouteNums.has(op.routeNum) && op.segments.length > 0);

  return ops;
}

/**
 * Driver IDs mentioned in the feedback that aren't in the registry yet,
 * paired with the broker team of the route they appear on.
 */
export function collectUnknownDrivers(
  ops: FeedbackOp[],
  routes: RouteData[],
  registry: DriverRegistry
): { id: string; group: string }[] {
  const seen = new Map<string, string>();
  for (const op of ops) {
    const baseRoute = routes.find(r => r.routeNum === op.routeNum);
    for (const seg of op.segments) {
      if (!seg.driverId || registry[seg.driverId] || seen.has(seg.driverId)) continue;
      // Prefer the team of the specific cut row (a company base can have a
      // broker-owned ".1" part), falling back to the base row's team.
      const partRoute = seg.partIdx > 0 ? routes.find(r => r.routeNum === `${op.routeNum}.${seg.partIdx}`) : undefined;
      seen.set(seg.driverId, partRoute?.driverGroup || baseRoute?.driverGroup || 'Unassigned');
    }
  }
  return [...seen.entries()].map(([id, group]) => ({ id, group }));
}

/**
 * Applies parsed feedback to the route table with PART-UPDATE semantics:
 * each segment targets one specific part (base row or ".n" cut row) and
 * leaves unmentioned parts alone — a company-owned base whose ".1" cut
 * belongs to a broker is updated without touching the company row.
 * Pure function; totals per base route are always preserved.
 */
export function applyFeedbackOps(
  routes: RouteData[],
  ops: FeedbackOp[],
  registry: DriverRegistry
): { routes: RouteData[]; notes: string[] } {
  const notes: string[] = [];
  let result = [...routes];

  for (const op of ops) {
    const baseIdx = result.findIndex(r => r.routeNum === op.routeNum);
    if (baseIdx === -1) {
      notes.push(`${op.routeNum}: 表格里找不到这条线，已跳过`);
      continue;
    }

    // Pull the base row and its numeric ".n" cut rows out as a parts map
    const prefix = `${op.routeNum}.`;
    const isPartRow = (r: RouteData) =>
      r.routeNum.startsWith(prefix) && /^\d+$/.test(r.routeNum.slice(prefix.length));
    const parts = new Map<number, RouteData>();
    parts.set(0, result[baseIdx]);
    for (const r of result) {
      if (isPartRow(r)) parts.set(parseInt(r.routeNum.slice(prefix.length)), r);
    }
    const baseRow = parts.get(0)!;
    result = result.filter(r => r !== baseRow && !isPartRow(r));
    const insertAt = Math.min(baseIdx, result.length);

    const totalBefore = [...parts.values()].reduce((s, r) => s + (Number(r.orderVolume) || 0), 0);

    const describe = (driverId: string, partIdx: number) => {
      const d = registry[driverId];
      const fallbackGroup = parts.get(partIdx)?.driverGroup || baseRow.driverGroup || 'Unassigned';
      return { name: d?.name || `Driver ${driverId}`, group: d?.group || fallbackGroup };
    };

    const segs = [...op.segments].sort((a, b) => a.partIdx - b.partIdx);
    const baseVolumeExplicit = segs.some(s => s.partIdx === 0 && s.volume !== null);
    const nullCreations: number[] = [];
    let lastExplicitPart: number | null = null;

    for (const seg of segs) {
      const info = describe(seg.driverId, seg.partIdx);
      const existing = parts.get(seg.partIdx);
      if (existing) {
        parts.set(seg.partIdx, {
          ...existing,
          driverId: seg.driverId,
          driverName: info.name,
          driver: info.name,
          driverGroup: info.group,
          ...(seg.volume !== null ? { orderVolume: seg.volume } : {}),
          capacityStatus: undefined,
          capacityExcess: 0,
          isDriverOff: false,
        });
      } else {
        parts.set(seg.partIdx, {
          ...baseRow,
          id: `fb-${baseRow.id}-${seg.partIdx}-${Date.now()}`,
          routeNum: `${op.routeNum}.${seg.partIdx}`,
          parentId: baseRow.id,
          isSplit: true,
          driverId: seg.driverId,
          driverName: info.name,
          driver: info.name,
          driverGroup: info.group,
          orderVolume: seg.volume ?? 0,
          capacityStatus: undefined,
          capacityExcess: 0,
          isDriverOff: false,
        });
        if (seg.volume === null) nullCreations.push(seg.partIdx);
      }
      if (seg.volume !== null) lastExplicitPart = seg.partIdx;
    }
    if (parts.size > 1) parts.set(0, { ...parts.get(0)!, isSplit: true });

    // Newly created parts without a stated volume take the remainder
    if (nullCreations.length > 0) {
      const others = [...parts.entries()]
        .filter(([pi]) => !nullCreations.includes(pi))
        .reduce((s, [, r]) => s + (Number(r.orderVolume) || 0), 0);
      const remainder = Math.max(0, totalBefore - others);
      const share = Math.floor(remainder / nullCreations.length);
      let leftover = remainder - share * nullCreations.length;
      for (const pi of nullCreations) {
        const v = share + (leftover > 0 ? 1 : 0);
        if (leftover > 0) leftover--;
        parts.set(pi, { ...parts.get(pi)!, orderVolume: v });
      }
      if (nullCreations.length > 1) notes.push(`${op.routeNum}: 多段未写件数，已平分剩余量`);
    }

    // Keep the platform total for this base route intact
    const totalAfter = [...parts.values()].reduce((s, r) => s + (Number(r.orderVolume) || 0), 0);
    if (totalAfter !== totalBefore) {
      const adjustPart = !baseVolumeExplicit ? 0 : (lastExplicitPart ?? 0);
      const row = parts.get(adjustPart)!;
      const adjusted = (Number(row.orderVolume) || 0) + (totalBefore - totalAfter);
      if (adjusted > 0) {
        parts.set(adjustPart, { ...row, orderVolume: adjusted });
        notes.push(`${op.routeNum}: 为保持货量 ${totalBefore}，${adjustPart === 0 ? '主段' : `第 ${adjustPart} 段`}已调整为 ${adjusted}`);
      } else {
        notes.push(`${op.routeNum}: 反馈件数合计与货量 ${totalBefore} 不符，按反馈原样套用（请检查）`);
      }
    }

    const block = [...parts.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
    result = [...result.slice(0, insertAt), ...block, ...result.slice(insertAt)];
  }

  return { routes: result, notes };
}
