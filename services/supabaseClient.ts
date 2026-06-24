import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Don't throw — let the app still run on localStorage/defaults if Supabase
  // isn't configured yet (e.g. first time setting this up, or AI Studio
  // preview env without the vars set).
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set. ' +
    'Falling back to local defaults — driver registry changes will not sync.'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
