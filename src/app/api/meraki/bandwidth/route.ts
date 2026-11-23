import { NextResponse } from "next/server";
import { getNetworkBandwidthHistory } from "@/lib/meraki";
import { validateId, parseIntParam, errorResponse } from "@/lib/apiUtils";
import { checkRateLimit } from "@/lib/rateLimit";
import { snapUp } from "@/lib/formatters";

// Allowed timespan / resolution pairs (seconds)
const VALID_TIMESPANS   = [7200, 86400, 604800, 2592000] as const;
const VALID_RESOLUTIONS = [60, 300, 600, 3600, 86400]    as const;

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "/api/meraki/bandwidth");
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  try {
    const networkId  = validateId(searchParams.get("networkId"), "networkId");
    const timespan   = parseIntParam(searchParams.get("timespan"),   86400, 3600, 2592000);
    const resolution = parseIntParam(searchParams.get("resolution"),  3600,   60,   86400);

    // Snap to allowed values so arbitrary numbers aren't forwarded to the upstream API
    const snappedTimespan   = snapUp(timespan,   VALID_TIMESPANS,   86400);
    const snappedResolution = snapUp(resolution, VALID_RESOLUTIONS,  3600);

    const data = await getNetworkBandwidthHistory(networkId, snappedTimespan, snappedResolution);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err, "GET /bandwidth");
  }
}
