import { NextResponse } from "next/server";
import { getDevice, getDeviceManagementInterface, getDevicePerformance } from "@/lib/meraki";
import { validateSerial, errorResponse } from "@/lib/apiUtils";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET(
  _request: Request,
  { params }: { params: { serial: string } }
) {
  const limited = checkRateLimit(_request, "/api/meraki/device");
  if (limited) return limited;

  try {
    const serial = validateSerial(params.serial);

    const [device, mgmt, perf] = await Promise.allSettled([
      getDevice(serial),
      getDeviceManagementInterface(serial),
      getDevicePerformance(serial),
    ]);

    return NextResponse.json({
      device:      device.status === "fulfilled" ? device.value : null,
      mgmt:        mgmt.status   === "fulfilled" ? mgmt.value   : null,
      performance: perf.status   === "fulfilled" ? perf.value   : null,
    });
  } catch (err) {
    return errorResponse(err, "GET /device/[serial]");
  }
}
