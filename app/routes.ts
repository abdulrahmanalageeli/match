import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),            // maps to "/"
  route("welcome", "routes/welcome.tsx"),
  route("admin", "routes/admin.tsx"),
   // maps to "/welcome"
] satisfies RouteConfig;
