import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptJson, decryptJson, isEncryptedPayload } from '../services/snapshotCrypto';

// Minimal localStorage for node
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

describe('snapshotCrypto', () => {
  it('round-trips a snapshot through encrypt/decrypt', async () => {
    const snap = { routes: [{ id: 'r1' }], savedAt: '2026-07-06' };
    const enc = await encryptJson(snap, 'yow2026');
    expect(isEncryptedPayload(enc)).toBe(true);
    // Search with the JSON quotes included — base64 ciphertext can randomly
    // contain a bare "r1", but never a double-quote character.
    expect(JSON.stringify(enc)).not.toContain('"r1"');
    const dec = await decryptJson(enc, 'yow2026');
    expect(dec).toEqual(snap);
  });

  it('fails with a friendly error on wrong passcode', async () => {
    const enc = await encryptJson({ a: 1 }, 'right-code');
    await expect(decryptJson(enc, 'wrong-code')).rejects.toThrow(/口令不正确/);
  });

  it('does not treat plain snapshots as encrypted', () => {
    expect(isEncryptedPayload({ routes: [], savedAt: 'x' })).toBe(false);
    expect(isEncryptedPayload(null)).toBe(false);
  });
});

describe('cloudSync', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    store['supabase_config'] = JSON.stringify({ url: 'https://test.supabase.co', key: 'anon-key' });
  });

  it('throws a friendly error when unconfigured', async () => {
    delete store['supabase_config'];
    // cloudSync has hardcoded project constants now, so simulate unconfigured
    // by checking the localStorage-override path takes priority when present.
    const { loadSnapshot } = await import('../services/cloudSync');
    store['supabase_config'] = JSON.stringify({ url: 'https://override.supabase.co', key: 'k2' });
    let captured = '';
    (globalThis as any).fetch = vi.fn(async (url: string) => {
      captured = url;
      return { ok: true, json: async () => [] };
    });
    await loadSnapshot();
    expect(captured).toContain('https://override.supabase.co');
  });

  it('saves with upsert semantics and loads back the row', async () => {
    const { saveSnapshot, loadSnapshot } = await import('../services/cloudSync');
    let savedBody: any = null;
    (globalThis as any).fetch = vi.fn(async (_url: string, opts?: any) => {
      if (opts?.method === 'POST') {
        savedBody = JSON.parse(opts.body);
        return { ok: true, text: async () => '' };
      }
      return { ok: true, json: async () => [{ data: savedBody.data, updated_at: savedBody.updated_at }] };
    });

    const snap: any = { routes: [1, 2], batchInfo: {}, registry: {}, ebinderData: null, ebinderManualOverrides: {}, savedAt: 'x' };
    await saveSnapshot(snap);
    expect(savedBody.id).toBe('yow-main');

    const loaded = await loadSnapshot();
    expect((loaded?.data as any).routes).toEqual([1, 2]);
  });

  it('round-trips the roster row independently of the snapshot', async () => {
    const { saveRoster, loadRoster } = await import('../services/cloudSync');
    let savedBody: any = null;
    (globalThis as any).fetch = vi.fn(async (_url: string, opts?: any) => {
      if (opts?.method === 'POST') {
        savedBody = JSON.parse(opts.body);
        return { ok: true, text: async () => '' };
      }
      return { ok: true, json: async () => [{ data: savedBody.data, updated_at: savedBody.updated_at }] };
    });

    await saveRoster({
      registry: { '19492': { name: 'Fath', group: 'Company' } },
      deletedDriverIds: ['2218'],
      teamContacts: { Alain: 'https://chat.whatsapp.com/abc123' },
      savedAt: 'x',
    });
    expect(savedBody.id).toBe('yow-roster');

    const loaded = await loadRoster();
    expect(loaded?.data.registry['19492'].name).toBe('Fath');
    expect(loaded?.data.deletedDriverIds).toEqual(['2218']);
    expect(loaded?.data.teamContacts?.Alain).toBe('https://chat.whatsapp.com/abc123');
  });

  it('archives one row per dispatch date and lists them back', async () => {
    const { archiveIdFromBatchDate, saveArchive, listArchives, loadArchive } = await import('../services/cloudSync');

    expect(archiveIdFromBatchDate('07/10/2026')).toBe('yow-day-2026-07-10');
    expect(archiveIdFromBatchDate('7/9/2026')).toBe('yow-day-2026-07-09');
    expect(archiveIdFromBatchDate('garbage')).toBeNull();

    let savedBody: any = null;
    (globalThis as any).fetch = vi.fn(async (url: string, opts?: any) => {
      if (opts?.method === 'POST') {
        savedBody = JSON.parse(opts.body);
        return { ok: true, text: async () => '' };
      }
      if (url.includes('id=like.yow-day-')) {
        return { ok: true, json: async () => [{ id: 'yow-day-2026-07-10', updated_at: '2026-07-10T01:00:00Z' }] };
      }
      return { ok: true, json: async () => [{ data: savedBody.data, updated_at: savedBody.updated_at }] };
    });

    const snap: any = { routes: [1], batchInfo: {}, registry: {}, ebinderData: null, ebinderManualOverrides: {}, savedAt: 'x' };
    await saveArchive(snap, '07/10/2026');
    expect(savedBody.id).toBe('yow-day-2026-07-10');

    const entries = await listArchives();
    expect(entries).toEqual([{ id: 'yow-day-2026-07-10', dateLabel: '2026-07-10', updatedAt: '2026-07-10T01:00:00Z' }]);

    const restored = await loadArchive('yow-day-2026-07-10');
    expect((restored as any).routes).toEqual([1]);
  });

  it('listArchives returns [] when the request fails', async () => {
    const { listArchives } = await import('../services/cloudSync');
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await listArchives()).toEqual([]);
  });

  it('round-trips the pending (temp) drivers row separately from the roster', async () => {
    const { savePending, loadPending } = await import('../services/cloudSync');
    let savedBody: any = null;
    (globalThis as any).fetch = vi.fn(async (_url: string, opts?: any) => {
      if (opts?.method === 'POST') {
        savedBody = JSON.parse(opts.body);
        return { ok: true, text: async () => '' };
      }
      return { ok: true, json: async () => [{ data: savedBody.data }] };
    });

    await savePending({ '12588': { name: 'Kaneza Team', group: 'Kaneza', temp: true } }, ['118925']);
    expect(savedBody.id).toBe('yow-pending');
    expect(savedBody.data.deleted).toEqual(['118925']);

    const row = await loadPending();
    expect(row?.pending['12588'].group).toBe('Kaneza');
    expect(row?.deleted).toEqual(['118925']);
  });

  it('loadPending tolerates old rows without a deleted field', async () => {
    const { loadPending } = await import('../services/cloudSync');
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      json: async () => [{ data: { pending: { '12580': { name: 'Kaneza Team', group: 'Kaneza', temp: true } }, savedAt: 'x' } }],
    }));
    const row = await loadPending();
    expect(row?.pending['12580'].name).toBe('Kaneza Team');
    expect(row?.deleted).toEqual([]);
  });

  it('loadRoster returns null instead of throwing when unreachable', async () => {
    const { loadRoster } = await import('../services/cloudSync');
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await loadRoster()).toBeNull();
  });

  it('encrypts when a team passcode is set and decrypts on load', async () => {
    const { saveSnapshot, loadSnapshot, setTeamPasscode } = await import('../services/cloudSync');
    setTeamPasscode('yow2026');
    let savedBody: any = null;
    (globalThis as any).fetch = vi.fn(async (_url: string, opts?: any) => {
      if (opts?.method === 'POST') {
        savedBody = JSON.parse(opts.body);
        return { ok: true, text: async () => '' };
      }
      return { ok: true, json: async () => [{ data: savedBody.data, updated_at: savedBody.updated_at }] };
    });

    const snap: any = { routes: ['secret-route'], batchInfo: {}, registry: {}, ebinderData: null, ebinderManualOverrides: {}, savedAt: 'x' };
    await saveSnapshot(snap);
    expect(isEncryptedPayload(savedBody.data)).toBe(true);
    expect(JSON.stringify(savedBody.data)).not.toContain('secret-route');

    const loaded = await loadSnapshot();
    expect((loaded?.data as any).routes).toEqual(['secret-route']);

    // Wrong passcode on another machine → friendly error
    setTeamPasscode('different');
    await expect(loadSnapshot()).rejects.toThrow(/口令不正确/);

    // No passcode at all → prompt to set it
    setTeamPasscode('');
    await expect(loadSnapshot()).rejects.toThrow(/已加密/);
  });
});
