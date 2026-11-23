import { NextRequest, NextResponse } from "next/server";
import { getEvents, getCount, type WebhookCategory } from "@/lib/webhookStore";

const VALID_CATEGORIES = new Set<WebhookCategory>([
  "device", "uplink", "security", "config", "sensor", "other",
]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Parse ?since= (timestamp in ms)
  const sinceParam = searchParams.get("since");
  const since = sinceParam ? Number(sinceParam) : undefined;
  if (sinceParam && (!Number.isFinite(since!) || since! < 0)) {
    return NextResponse.json({ error: "Invalid 'since' parameter" }, { status: 400 });
  }

  // Parse ?category=
  const categoryParam = searchParams.get("category");
  const category = categoryParam && VALID_CATEGORIES.has(categoryParam as WebhookCategory)
    ? (categoryParam as WebhookCategory)
    : undefined;

  // Parse ?countOnly= for badge polling
  const countOnly = searchParams.get("countOnly") === "true";

  if (countOnly) {
    return NextResponse.json({ count: getCount(since) });
  }

  const events = getEvents(since, category);
  return NextResponse.json(events);
}
