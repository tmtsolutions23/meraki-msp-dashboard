import { NextResponse } from "next/server";
import { getUplinks } from "@/lib/meraki";
import { validateId, errorResponse } from "@/lib/apiUtils";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "/api/meraki/uplinks");
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  try {
    const orgId = validateId(searchParams.get("orgId"), "orgId");
    const data  = await getUplinks(orgId);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err, "GET /uplinks");
  }
}
