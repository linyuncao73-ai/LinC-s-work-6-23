// Pure mapping from a raw Gemini "image" result → dispatch RouteData rows.
// No transport / no Supabase / no Vite — so it can be unit-tested under Node.
// `geminiParser.ts` calls this after fetching rawResult from the Edge Function.

import {
  type DriverRegistry,
  SCAN_ID_MAP,
  ZONE_NAMES,
  type RouteData,
  type BatchInfo,
  getDefaultTimeSlot,
  getOttawaTodayDateString,
} from "../types.ts";

export const parseAllocationSegments = (str: string) => {
  const segments: { start: number; end: number; ident: string }[] = [];
  const regex = /(\d+)-(\d+)\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    segments.push({
      start: parseInt(match[1]),
      end: parseInt(match[2]),
      ident: match[3].trim(),
    });
  }
  return segments;
};

export interface RawImageResult {
  batchId?: string;
  date?: string;
  rows?: Array<{
    routeNum?: string;
    totalVolume?: number;
    allocationString?: string;
    scanId?: string;
    timeSlot?: string;
  }>;
}

export function mapImageResultToRoutes(
  rawResult: RawImageResult,
  registry: DriverRegistry,
): { routes: RouteData[]; batchInfo: BatchInfo } {
  const extractedRows = rawResult.rows || [];
  const routes: RouteData[] = [];
  let totalVolumeAccumulated = 0;

  // Use extracted date or today as fallback
  let displayDate = rawResult.date || "";
  if (!displayDate) {
    displayDate = getOttawaTodayDateString();
  }

  extractedRows.forEach((item: any, idx: number) => {
    const baseRoute = String(item.routeNum || "").trim();
    if (!/^33\d{3}/.test(baseRoute)) return;

    totalVolumeAccumulated += item.totalVolume || 0;
    const segments = parseAllocationSegments(item.allocationString || "");

    // Fallback time slot based on baseRoute and dynamic date mechanism
    const defaultTime = getDefaultTimeSlot(baseRoute, displayDate);
    const finalTimeSlot = item.timeSlot || defaultTime;

    if (segments.length > 0) {
      segments.forEach((seg, sIdx) => {
        const volume = seg.end - seg.start + 1;
        let finalRouteNum = "";
        let location = "Unknown";
        let driverId = seg.ident;
        let driverName = "Unassigned";
        let driverGroup = "Unassigned";

        if (seg.ident.includes("-")) {
          finalRouteNum = seg.ident;
          const parts = seg.ident.split("-");
          if (parts.length >= 3) {
            const base = parts[0];
            const zoneIdx = parts[parts.length - 1];
            location = ZONE_NAMES[`${base}-${zoneIdx}`] || "Unknown";
          }
        } else {
          const driverEntry = registry[seg.ident];
          driverName = driverEntry?.name || `Driver ${seg.ident}`;
          driverGroup = driverEntry?.group || "Unassigned";
          finalRouteNum = `${baseRoute}-${sIdx + 1}`;
          location = ZONE_NAMES[`${baseRoute}-${sIdx + 1}`] || "Unknown";
        }

        routes.push({
          id: `IMG-${finalRouteNum}-${idx}-${sIdx}`,
          driver: driverName,
          driverId: driverId,
          driverName: driverName,
          driverGroup: driverGroup,
          routeNum: finalRouteNum,
          routeLocation: location,
          timeSlot: finalTimeSlot,
          orderVolume: volume,
          scanId: item.scanId || SCAN_ID_MAP[baseRoute] || "????",
        });
      });
    } else {
      routes.push({
        id: `IMG-SINGLE-${baseRoute}-${idx}`,
        driver: "Unassigned",
        driverId: "",
        driverName: "Unassigned",
        driverGroup: "Unassigned",
        routeNum: baseRoute,
        routeLocation: ZONE_NAMES[baseRoute] || "Unknown",
        timeSlot: finalTimeSlot,
        orderVolume: item.totalVolume || 0,
        scanId: item.scanId || SCAN_ID_MAP[baseRoute] || "????",
      });
    }
  });

  return {
    routes,
    batchInfo: {
      date: displayDate,
      batchId: rawResult.batchId || "IMG-EXTRACT-" + Date.now(),
      totalVolume: totalVolumeAccumulated,
    },
  };
}
