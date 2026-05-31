import { supabase } from './supabase';

type Row = { key: string; value: string };

export async function csGet(key: string): Promise<string | null> {
  const { data } = await supabase
    .from('taylor_app_data')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  return (data as { value: string } | null)?.value ?? null;
}

export async function csGetJSON<T>(key: string): Promise<T | null> {
  const raw = await csGet(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function csSet(key: string, value: string): Promise<void> {
  if (!value) return;
  await supabase
    .from('taylor_app_data')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

export async function csSetJSON(key: string, value: unknown): Promise<void> {
  await csSet(key, JSON.stringify(value));
}

export async function csDel(key: string): Promise<void> {
  await supabase.from('taylor_app_data').delete().eq('key', key);
}

export async function csDelPattern(prefix: string): Promise<void> {
  await supabase.from('taylor_app_data').delete().like('key', `${prefix}%`);
}

export async function csSetBatch(entries: { key: string; value: string }[]): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map(e => ({ ...e, updated_at: new Date().toISOString() }));
  await supabase.from('taylor_app_data').upsert(rows, { onConflict: 'key' });
}

export async function csKeyExists(pattern: string): Promise<boolean> {
  const { data } = await supabase
    .from('taylor_app_data')
    .select('key')
    .like('key', pattern)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function csGetKeysByPattern(pattern: string): Promise<string[]> {
  const { data } = await supabase
    .from('taylor_app_data')
    .select('key')
    .like('key', pattern);
  return (data ?? []).map((r: { key: string }) => r.key);
}

// Fetches all app-level state excluding large chapter texts.
export async function csGetAppState(): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('taylor_app_data')
    .select('key, value')
    .not('key', 'like', 'chapter_%')
    .neq('key', '_migrated');
  return Object.fromEntries((data ?? [] as Row[]).map((r: Row) => [r.key, r.value]));
}
