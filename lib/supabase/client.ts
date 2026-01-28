import { createClient } from "@supabase/supabase-js";

const globalForSupabase = globalThis as typeof globalThis & {
  __supabaseClient?: ReturnType<typeof createClient>;
};

export const supabaseClient = () => {
  if (!globalForSupabase.__supabaseClient) {
    globalForSupabase.__supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  return globalForSupabase.__supabaseClient;
};
