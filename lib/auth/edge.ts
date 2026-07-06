import NextAuth from "next-auth";
import { edgeAuthConfig } from "@/lib/auth.config.edge";

export const { auth: middlewareAuth } = NextAuth(edgeAuthConfig);
