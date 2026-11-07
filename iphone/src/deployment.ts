// Public client configuration for the dedicated marriage project. Database grants
// and authenticated RPCs enforce access. Never place a service-role key here.
export const marriageProjectUrl = "https://wupkifqbwhhebwrgvwai.supabase.co";
export const marriagePublishableKey =
  "sb_publishable_A9VclBe-PMQEYVccvvkVhw_ZG0J_-lz";

// Staging must opt into its own project; a missing variable cannot silently
// turn a test build into a client for live members.
export function resolveDeployment(input: { mode?: string; url?: string; key?: string; local?: boolean; dev?: boolean }) {
  const mode = input.mode || "production";
  if (input.dev && input.local && !input.mode) return { selected: false, url: "", key: "", ready: false };
  const closed = { selected: true, url: "", key: "", ready: false };
  if (!["production", "staging"].includes(mode)) return closed;
  const suppliedUrl = input.url?.trim(), suppliedKey = input.key?.trim();
  const url = suppliedUrl || (mode === "production" ? marriageProjectUrl : "");
  const key = suppliedKey || (!suppliedUrl && mode === "production" ? marriagePublishableKey : "");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
      !["", "/"].includes(parsed.pathname) || parsed.port || !key.startsWith("sb_publishable_")) return closed;
    if (mode === "production" && parsed.origin !== marriageProjectUrl) return closed;
    if (mode === "staging" && (!suppliedUrl || !suppliedKey ||
      ["wupkifqbwhhebwrgvwai.supabase.co", "xytwdgiihfmxiflwuxti.supabase.co"].includes(parsed.hostname) ||
      !/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname))) return closed;
    return { selected: true, url: parsed.origin, key, ready: true };
  } catch { return closed; }
}
