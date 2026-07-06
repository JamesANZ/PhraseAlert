import { NextResponse } from "next/server";
import { middlewareAuth } from "@/lib/auth/edge";

export default middlewareAuth((req) => {
  if (!req.auth) {
    const login = new URL("/login", req.nextUrl.origin);
    login.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
});

export const config = {
  matcher: ["/watches/:path*"],
};
