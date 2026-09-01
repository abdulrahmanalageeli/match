import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import { Analytics } from "@vercel/analytics/react";

import type { Route } from "./+types/root";
import { LegalAcceptanceGate } from "./components/LegalAcceptanceGate";
import { LegalFooter } from "./components/LegalFooter";
import { redactAnalyticsUrl } from "./lib/analytics";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/Lg.png", type: "image/png" },
  { rel: "apple-touch-icon", href: "/Lg.png" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isTheRoom = location.pathname === "/the-room" || location.pathname.startsWith("/the-room/");
  const isEvent3 = location.pathname === "/event3" || location.pathname.startsWith("/event3/");
  const isCohost = location.pathname === "/admin-cohost" || location.pathname.startsWith("/admin-cohost/");
  const isMobileViewport = isEvent3 || isCohost || isTheRoom;
  const publicArabicRoutes = ["/welcome", "/terms", "/privacy", "/privacy-request", "/about"];
  const isArabicLayout = isCohost || isTheRoom || publicArabicRoutes.includes(location.pathname);
  const showLegalFooter = publicArabicRoutes.includes(location.pathname);
  const viewportContent = isMobileViewport
    ? "width=device-width, initial-scale=1, viewport-fit=cover"
    : "width=device-width, initial-scale=1";

  return (
    <html lang={isArabicLayout ? "ar" : "en"} dir={isArabicLayout ? "rtl" : undefined}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content={viewportContent} />
        <title>BlindMatch - لقاءات ذكية للتوافق</title>
        <meta name="description" content="نظام توافق شخصي متقدم لإيجاد أفضل التوافقات بناءً على الشخصية والاهتمامات" />
        <meta name="theme-color" content={isTheRoom ? "#f3f0e9" : isCohost ? "#06090f" : "#0891b2"} />
        <meta property="og:title" content="BlindMatch - لقاءات ذكية للتوافق" />
        <meta property="og:description" content="نظام توافق شخصي متقدم لإيجاد أفضل التوافقات" />
        <meta property="og:image" content="/Lg.png" />
        <meta property="og:type" content="website" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <LegalAcceptanceGate />
        {showLegalFooter ? <LegalFooter /> : null}
        <ScrollRestoration />
        <Scripts />
        <Analytics beforeSend={redactAnalyticsUrl} />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
