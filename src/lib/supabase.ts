import { createClient } from '@supabase/supabase-js';

// Supabase URL 클리닝 (끝의 /rest/v1 또는 /rest/v1/ 제거)
function cleanSupabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return 'https://placeholder.supabase.co';
  return rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_anon_key';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

export const supabaseUrl = cleanSupabaseUrl(rawUrl);

export const supabase = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false },
});

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
