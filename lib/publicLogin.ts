/** Reversible public UI switch while the owner keeps Supabase inactive.
 * This is NOT an authorization control: API/admin guards remain unchanged.
 * Only the explicit public boolean may be read during build-time rendering.
 */
const browserSetting = import.meta.env?.VITE_PUBLIC_LOGIN_ENABLED;
const buildSetting = typeof window === 'undefined' && typeof process !== 'undefined'
  ? process.env.VITE_PUBLIC_LOGIN_ENABLED : undefined;
export const PUBLIC_LOGIN_ENABLED = (browserSetting ?? buildSetting) === 'true';
