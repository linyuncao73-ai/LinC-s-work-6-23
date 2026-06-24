import { supabase, isSupabaseConfigured } from './supabaseClient';
import { DriverRegistry, INITIAL_DRIVER_REGISTRY } from '../types';

const LOCAL_CACHE_KEY = 'yow_dispatch_registry';

/**
 * Loads the driver registry.
 * - If Supabase is configured and reachable, fetch from there (source of truth)
 *   and refresh the local cache.
 * - Otherwise, fall back to whatever is cached in localStorage.
 * - If neither exists, fall back to the hardcoded INITIAL_DRIVER_REGISTRY
 *   (kept in types.ts purely as an offline/first-run safety net, not the
 *   source of truth anymore).
 */
export async function loadDriverRegistry(): Promise<DriverRegistry> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('driver_id, name, group_name');

      if (error) throw error;

      if (data && data.length > 0) {
        const registry: DriverRegistry = {};
        for (const row of data) {
          registry[row.driver_id] = { name: row.name, group: row.group_name };
        }
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(registry));
        return registry;
      }
    } catch (e) {
      console.error('[driverRegistry] Supabase fetch failed, using local cache:', e);
    }
  }

  const cached = localStorage.getItem(LOCAL_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // fall through to defaults
    }
  }

  return INITIAL_DRIVER_REGISTRY;
}

/**
 * Upserts a single driver (used when the user edits a driver inline in the
 * Editor table, or via a future "manage drivers" screen).
 */
export async function upsertDriver(
  driverId: string,
  name: string,
  group: string
): Promise<void> {
  if (!isSupabaseConfigured) return; // local-only mode, nothing to sync

  const { error } = await supabase
    .from('drivers')
    .upsert(
      { driver_id: driverId, name, group_name: group },
      { onConflict: 'driver_id' }
    );

  if (error) {
    console.error('[driverRegistry] Failed to sync driver to Supabase:', error);
  }
}

/**
 * Bulk upsert — handy for the one-time migration of INITIAL_DRIVER_REGISTRY,
 * or for pasting in a new batch of drivers from Excel.
 */
export async function upsertDrivers(registry: DriverRegistry): Promise<void> {
  if (!isSupabaseConfigured) return;

  const rows = Object.entries(registry).map(([driver_id, info]) => ({
    driver_id,
    name: info.name,
    group_name: info.group,
  }));

  const { error } = await supabase
    .from('drivers')
    .upsert(rows, { onConflict: 'driver_id' });

  if (error) {
    console.error('[driverRegistry] Bulk sync to Supabase failed:', error);
  }
}
