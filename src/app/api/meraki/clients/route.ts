import { NextResponse } from "next/server";
import { getNetworkClientCounts, getOrgClientsOverview } from "@/lib/meraki";
import { validateId, parseIntParam, ValidationError, errorResponse } from "@/lib/apiUtils";
import { checkRateLimit } from "@/lib/rateLimit";
import { snapUp } from "@/lib/formatters";

const VALID_MODES    = ["networks", "overview"] as const;
const VALID_TIMESPANS = [3600, 28800, 86400, 604800] as const;

type Mode = (typeof VALID_MODES)[number];

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "/api/meraki/clients");
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  try {
    const orgId    = validateId(searchParams.get("orgId"), "orgId");
    const rawMode  = searchParams.get("mode") ?? "networks";

    if (!(VALID_MODES as readonly string[]).includes(rawMode)) {
      throw new ValidationError(`Invalid mode "${rawMode}". Allowed: ${VALID_MODES.join(", ")}`);
    }
    const mode = rawMode as Mode;

    const timespan = snapUp(
      parseIntParam(searchParams.get("timespan"), 3600, 60, 604800),
      VALID_TIMESPANS,
      3600
    );

    if (mode === "overview") {
      return NextResponse.json(await getOrgClientsOverview(orgId, timespan));
    }
    return NextResponse.json(await getNetworkClientCounts(orgId, timespan));
  } catch (err) {
    return errorResponse(err, "GET /clients");
  }
}
