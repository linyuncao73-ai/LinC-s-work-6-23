import { RouteData, BatchInfo, DriverRegistry, EbinderData } from "../types";

// Filled in once the team's Supabase project details are provided.
// The publishable (anon) key is safe to ship in frontend code when RLS is on.
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

const SNAPSHOT_ID = 'yow-main';

export interface DispatchSnapshot {
  routes: RouteData[];
  batchInfo: BatchInfo;
  registry: DriverRegistry;
  ebinderData: EbinderData | null;
  ebinderManualOverrides: Record<string, boolean>;
  savedAt: string;
}

function getConfig(): { url: string; key: string } {
  // localStorage override lets us configure without a redeploy
  try {
    const saved = localStorage.getItem('supabase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.url && parsed.key) return { url: parsed.url, key: parsed.key };
    }
  } catch { /* fall through to constants */ }
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
  throw new Error('云同步还未配置。请联系管理员设置 Supabase 项目信息。');
}

export async function saveSnapshot(data: DispatchSnapshot): Promise<void> {
  const { url, key } = getConfig();
  const res = await fetch(`${url}/rest/v1/dispatch_snapshots`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id: SNAPSHOT_ID, data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`保存失败（HTTP ${res.status}）。${text.slice(0, 200)}`);
  }
}

export async function loadSnapshot(): Promise<{ data: DispatchSnapshot; updatedAt: string } | null> {
  const { url, key } = getConfig();
  const res = await fetch(
    `${url}/rest/v1/dispatch_snapshots?id=eq.${SNAPSHOT_ID}&select=data,updated_at`,
    { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`加载失败（HTTP ${res.status}）。${text.slice(0, 200)}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return { data: rows[0].data, updatedAt: rows[0].updated_at };
}
