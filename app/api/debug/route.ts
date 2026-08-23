import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "NOT SET",
    INSTAGRAM_APP_ID_PREFIX: process.env.INSTAGRAM_APP_ID
      ? `${process.env.INSTAGRAM_APP_ID.substring(0, 6)}...`
      : "NOT SET",
    INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET ? "SET" : "NOT SET",
    FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET ? "SET" : "NOT SET",
    VERCEL_URL: process.env.VERCEL_URL ?? "NOT SET",
    META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION ?? "NOT SET",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "SET" : "NOT SET",
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ? "SET" : "NOT SET",
    DATABASE_URL: process.env.DATABASE_URL ? "SET (starts with: " + process.env.DATABASE_URL.substring(0, 15) + "..." : "NOT SET",
    REDIS_URL: process.env.REDIS_URL ? "SET" : "NOT SET",
    RESEND_API_KEY: process.env.RESEND_API_KEY ? "SET" : "NOT SET",
  });
}