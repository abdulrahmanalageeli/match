import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),            // maps to "/"
  route("welcome", "routes/welcome.tsx"),
  route("admin", "routes/admin.tsx"),
  route("matrix", "routes/matrix.tsx"),
  route("results", "routes/results.tsx"), // ✅ Results page
   // maps to "/welcome"
] satisfies RouteConfig;
