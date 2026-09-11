import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://yobmyrjejrknvmkxawuf.supabase.co";

const supabaseAnonKey = "sb_publishable_o2tPZFOjweuKV9DnT5mBWg_cfzT7vyw";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
