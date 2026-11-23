import { NextResponse } from "next/server";
import { getLicenseAlerts, getOrgLicenseOverview } from "@/lib/meraki";
import { validateId, errorResponse } from "@/lib/apiUtils";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "/api/meraki/licenses");
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  try {
    const orgId = searchParams.get("orgId");
    if (orgId) {
      // Per-org license details
      const data = await getOrgLicenseOverview(validateId(orgId, "orgId"));
      return NextResponse.json(data);
    }
    // All orgs — expiring/expired only
    const data = await getLicenseAlerts();
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err, "GET /licenses");
  }
}
