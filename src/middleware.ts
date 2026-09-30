import { NextResponse, type NextRequest } from "next/server";

/**
 * EVERY /api/ RESPONSE IS LIVE DATA — say so in one place.
 *
 * Next.js only adds `Cache-Control` when a route asks for it, so most of this
 * API shipped without one. A response with no cache header is fair game for
 * heuristic caching in the browser and at the CDN edge, and the symptom is
 * exactly what the desk reported: post an event, reload the site, see the old
 * list; refresh a few more times until it finally lets go.
 *
 * File bytes are the deliberate exception. An uploaded image or a stored file
 * lives at a URL that changes when its contents change, so those keep their own
 * long-lived cache headers and are skipped here.
 */
const CACHEABLE = ["/api/images/", "/api/uploads/"];

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;
  if (!CACHEABLE.some((prefix) => pathname.startsWith(prefix))) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  }
  return response;
}

export const config = { matcher: "/api/:path*" };
