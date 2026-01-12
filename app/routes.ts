import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),            // maps to "/"
  route("welcome", "routes/welcome.tsx"),
  route("admin", "routes/admin.tsx"),
  route("admin-cohost", "routes/admin-cohost.tsx"),
  route("matrix", "routes/matrix.tsx"),
  route("results", "routes/results.tsx"), // ✅ Results page
  route("groups", "routes/groups.tsx"), // ✅ Groups games page
] satisfies RouteConfig;
