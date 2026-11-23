import { NextResponse } from "next/server";
import { getNetworkEvents } from "@/lib/meraki";
import { validateId, validateSerial, parseIntParam, errorResponse } from "@/lib/apiUtils";
import { checkRateLimit } from "@/lib/rateLimit";

const MAX_PER_PAGE = 100;

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "/api/meraki/events");
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  try {
    const networkId = validateId(searchParams.get("networkId"), "networkId");

    // serial is optional — only validate when supplied
    const rawSerial = searchParams.get("serial");
    const serial    = rawSerial ? validateSerial(rawSerial) : undefined;

    const perPage = parseIntParam(searchParams.get("perPage"), 20, 1, MAX_PER_PAGE);

    const data = await getNetworkEvents(networkId, serial, perPage);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err, "GET /events");
  }
}
