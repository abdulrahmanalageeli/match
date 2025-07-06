import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("welcome", "routes/welcome.tsx"),
  route("admin", "routes/admin.tsx"),
  route("matrix", "routes/matrix.tsx"),
  route("match-result", "routes/MatchResult.tsx"),
] satisfies RouteConfig;
