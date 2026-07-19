import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminSessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/admin") &&
    request.nextUrl.pathname !== "/admin/login"
  ) {
    const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
    const expected = await adminSessionToken();
    if (!cookie || cookie !== expected) {
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
