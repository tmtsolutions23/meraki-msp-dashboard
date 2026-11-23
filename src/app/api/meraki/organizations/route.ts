import { NextResponse } from "next/server";
import { getOrganizations, getOrgSummaries } from "@/lib/meraki";
import { safeError } from "@/lib/apiUtils";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "/api/meraki/organizations");
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const summary = searchParams.get("summary") === "true";
  try {
    const data = summary ? await getOrgSummaries() : await getOrganizations();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: safeError(err, "GET /organizations") }, { status: 500 });
  }
}
