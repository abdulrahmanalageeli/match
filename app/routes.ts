import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/welcome.tsx"),         // maps to "/" - welcome is now default
  route("welcome", "routes/welcome.tsx"), // keep /welcome route working
  route("home", "routes/home.tsx"),    // moved home to /home
  route("admin", "routes/admin.tsx"),
  route("matrix", "routes/matrix.tsx"),
  route("results", "routes/results.tsx"), // ✅ Results page
] satisfies RouteConfig;
