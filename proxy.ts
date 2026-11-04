import { NextResponse, type NextRequest } from "next/server";

// The public deployment has no administrator, accounts or Redis: those pages and APIs answer 404.
// The pages also call notFound(), but a streamed page has already sent status 200 by then.
export function proxy(request: NextRequest) {
  if (process.env.PUBLIC_MODE !== "true") return NextResponse.next({ request });
  const headers = { "Cache-Control": "no-store" };
  return request.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json({ error: "Not found" }, { status: 404, headers })
    : new NextResponse("Not found", { status: 404, headers });
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/account/:path*",
    "/api/admin/:path*",
    "/api/account/:path*",
    "/api/auth/:path*",
  ],
};
