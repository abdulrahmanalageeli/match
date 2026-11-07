import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  if (env.VERCEL_ENV === "preview" && !["demo", "staging"].includes(env.VITE_ADMIN_MODE || "demo")) {
    throw new Error("Preview deployments must use demo or an isolated staging project.");
  }
  return { server: { host: "127.0.0.1", port: 5174 }, build: { sourcemap: false } };
});
