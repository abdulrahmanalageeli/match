import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/remix";

export default {
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  // Vercel deployment configuration
  presets: [vercelPreset()],
} satisfies Config;
