import { NextResponse } from "next/server";
import { isQuoterConfigured } from "@/lib/quoter";

export async function GET() {
  return NextResponse.json({ configured: isQuoterConfigured() });
}
