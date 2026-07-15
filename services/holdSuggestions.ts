import { RouteData, ZONE_NAMES } from "../types";

/**
 * Hold 建议：偏远线货量低于门槛时，建议今天不派、押到明天一起送。
 * 门槛由调度经验给定（"以下"含本数，即 volume <= threshold 触发建议）。
 */

interface SingleRule { kind: 'single'; zone: string; threshold: number }
interface ComboRule { kind: 'combo'; zones: string[]; label: string; threshold: number }

const HOLD_RULES: (SingleRule | ComboRule)[] = [
  { kind: 'single', zone: 'Brookville', threshold: 120 },
  { kind: 'single', zone: 'Calton Place', threshold: 100 },
  { kind: 'single', zone: 'Renfrew', threshold: 100 },
  { kind: 'single', zone: 'Perth', threshold: 100 },
  // 33055 的 3、4 号线（R-G 与 M-M-R-E）合计货量低于 150 才建议一起 hold
  { kind: 'combo', zones: ['R-G', 'M-M-R-E'], label: '55-3 + 55-4', threshold: 150 },
];

export interface HoldSuggestion {
  /** 展示名，如 "Brookville" 或 "55-3 + 55-4" */
  label: string;
  routeIds: string[];
  routeNums: string[];
  volume: number;
  threshold: number;
}

/** 一条路线可能匹配的区域名：Location 列内容 + routeNum 反查 ZONE_NAMES。 */
function zoneNamesOf(route: RouteData): Set<string> {
  const names = new Set<string>();
  const loc = (route.routeLocation || '').trim().toLowerCase();
  if (loc && loc !== 'unknown') names.add(loc);
  // "33050-3-1" → base 33050, 末位 1 → ZONE_NAMES['33050-1'] = Brookville
  const parts = String(route.routeNum || '').trim().split('-');
  if (parts.length >= 2) {
    const mapped = ZONE_NAMES[`${parts[0]}-${parts[parts.length - 1]}`];
    if (mapped) names.add(mapped.toLowerCase());
  }
  return names;
}

/**
 * 扫描当前表格，返回值得建议 Hold 的路线组。
 * 已经 hold 的行不重复建议；货量为 0 的行（还没数据）不触发。
 */
export function getHoldSuggestions(routes: RouteData[]): HoldSuggestion[] {
  const active = routes.filter(r => !r.isHold);
  const suggestions: HoldSuggestion[] = [];

  for (const rule of HOLD_RULES) {
    const wanted = (rule.kind === 'single' ? [rule.zone] : rule.zones).map(z => z.toLowerCase());
    const matched = active.filter(r => {
      const names = zoneNamesOf(r);
      return wanted.some(w => names.has(w));
    });
    const volume = matched.reduce((s, r) => s + (r.orderVolume || 0), 0);
    if (matched.length === 0 || volume <= 0 || volume > rule.threshold) continue;
    suggestions.push({
      label: rule.kind === 'single' ? rule.zone : rule.label,
      routeIds: matched.map(r => r.id),
      routeNums: matched.map(r => r.routeNum),
      volume,
      threshold: rule.threshold,
    });
  }
  return suggestions;
}
