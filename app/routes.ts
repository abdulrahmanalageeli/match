import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),            // maps to "/"
  route("welcome", "routes/welcome.tsx"),
  route("admin", "routes/admin.tsx"),
  route("admin-cohost", "routes/admin-cohost.tsx"),
  route("matrix", "routes/matrix.tsx"),
  route("results", "routes/results.tsx"), // ✅ Results page
  route("groups", "routes/groups.tsx"), // ✅ Groups games page
  route("event3", "routes/event3.tsx"), // ✅ BlindMatch 4.0 participant page
  route("admin3", "routes/admin3.tsx"), // ✅ BlindMatch 4.0 admin panel
  route("the-room", "routes/the-room.tsx"), // Standalone The Room event operations
  route("privacy", "routes/privacy.tsx"),
  route("terms", "routes/terms.tsx"),
  route("privacy-request", "routes/privacy-request.tsx"),
] satisfies RouteConfig;
