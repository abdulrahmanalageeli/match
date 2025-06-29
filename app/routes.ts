import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),            // maps to "/"
  route("welcome", "routes/welcome.tsx"),
  route("admin", "routes/admin.tsx"),
  route("matrix", "routes/matrix.tsx"), // ✅ Add this line
   // maps to "/welcome"
] satisfies RouteConfig;
