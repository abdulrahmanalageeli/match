import type { BeforeSendEvent } from "@vercel/analytics/react";

export function redactAnalyticsUrl(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    // Participant links carry login tokens; analytics only needs the page path.
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    // Never send an unparseable URL that might contain private data.
    return null;
  }
}
