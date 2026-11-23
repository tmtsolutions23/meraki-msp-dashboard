import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { isQuoterConfigured, findCustomer, findItem, createQuote, addLineItem } from "@/lib/quoter";
import eolModels from "@/data/meraki-eol-models.json";

interface EolDevice {
  serial: string;
  model: string;
  name: string;
}

interface RequestBody {
  orgName: string;
  devices: EolDevice[];
}

const eolMap = eolModels as Record<string, {
  replacement: string;
  replacementLicense: string;
  eolDate: string;
  eosDate: string;
  category: string;
}>;

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, "/api/quoter/generate-quote", 5);
  if (limited) return limited;

  if (!isQuoterConfigured()) {
    return NextResponse.json(
      { error: "Quoter API credentials not configured" },
      { status: 503 }
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { orgName, devices } = body;
  if (!orgName || !Array.isArray(devices) || devices.length === 0) {
    return NextResponse.json({ error: "orgName and devices[] are required" }, { status: 400 });
  }

  try {
    // 1. Find customer in Quoter
    const customer = await findCustomer(orgName);
    if (!customer) {
      return NextResponse.json(
        { error: `Customer "${orgName}" not found in Quoter. Create the customer in Quoter first.` },
        { status: 404 }
      );
    }

    // 2. Create the quote
    const quoteName = `Meraki Hardware Replacement — ${orgName}`;
    const quote = await createQuote(customer.id, quoteName);

    // 3. Add line items for each EOL device
    // Cache item lookups to avoid redundant searches
    const itemCache = new Map<string, { id: number; name: string } | null>();

    const matched: { device: EolDevice; hardware: string; license: string }[] = [];
    const unmatched: { device: EolDevice; reason: string }[] = [];

    for (const device of devices) {
      const eolInfo = eolMap[device.model];
      if (!eolInfo) {
        unmatched.push({ device, reason: "Model not in EOL database" });
        continue;
      }

      // Search for hardware replacement
      let hwItem = itemCache.get(eolInfo.replacement);
      if (hwItem === undefined) {
        const found = await findItem(eolInfo.replacement);
        hwItem = found ? { id: found.id, name: found.name } : null;
        itemCache.set(eolInfo.replacement, hwItem);
      }

      // Search for license
      let licItem = itemCache.get(eolInfo.replacementLicense);
      if (licItem === undefined) {
        const found = await findItem(eolInfo.replacementLicense);
        licItem = found ? { id: found.id, name: found.name } : null;
        itemCache.set(eolInfo.replacementLicense, licItem);
      }

      if (!hwItem && !licItem) {
        unmatched.push({ device, reason: `Replacement items not found in Quoter: ${eolInfo.replacement}, ${eolInfo.replacementLicense}` });
        continue;
      }

      // Add hardware line item
      if (hwItem) {
        await addLineItem(
          quote.id,
          hwItem.id,
          1,
          `Replaces ${device.model} (${device.name || device.serial})`
        );
      }

      // Add license line item
      if (licItem) {
        await addLineItem(
          quote.id,
          licItem.id,
          1,
          `License for ${eolInfo.replacement} replacing ${device.model}`
        );
      }

      matched.push({
        device,
        hardware: hwItem?.name ?? "Not found",
        license: licItem?.name ?? "Not found",
      });
    }

    return NextResponse.json({
      quoteId: quote.id,
      quoteName,
      customerName: customer.name,
      matched,
      unmatched,
    });
  } catch (err) {
    console.error("[quoter] generate-quote error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate quote" },
      { status: 500 }
    );
  }
}
