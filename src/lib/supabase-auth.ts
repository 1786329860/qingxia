import { createClient } from '@supabase/supabase-js';
import { memberStorageKey } from './member-storage';

// The publishable key identifies this project to Auth. Database access still requires authorization.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://ampgvmvtxutetcpwhztr.supabase.co';
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_KiCWD5I2-eQ9ldDeYHNEDA_ImERYYUU';

export const authClient = createClient(url, key, {
  auth: { storageKey: memberStorageKey, detectSessionInUrl: false },
}).auth;

export function recoveryClient() {
  return createClient(url, key, {
    auth: {
      storageKey: memberStorageKey + ':recovery',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }).auth;
}
