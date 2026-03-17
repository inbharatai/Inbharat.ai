import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Returns true when the value is absent or still holds a template placeholder. */
function isPlaceholder(s?: string): boolean {
  return (
    !s ||
    s.includes("your-project-ref") ||
    s.includes("placeholder") ||
    s === "your-service-role-key-here" ||
    s === "your-anon-key-here"
  );
}

export const supabaseAdmin =
  !isPlaceholder(supabaseUrl) && !isPlaceholder(serviceRoleKey)
    ? createClient(supabaseUrl!, serviceRoleKey!, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

