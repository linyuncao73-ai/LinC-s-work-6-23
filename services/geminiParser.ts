import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { DriverRegistry, SCAN_ID_MAP, ZONE_NAMES, RouteData, BatchInfo, getDefaultTimeSlot, getOttawaTodayDateString } from "../types";
import { getApiKey } from "./apiKey";
import { generateWithRetry } from "./geminiClient";

async function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string, mimeType: string } }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({
        inlineData: { data: base64Data, mimeType: file.type },
      });
    };
    reader.onerror = () => reject(new Error('文件读取失败，请重试'));
    reader.readAsDataURL(file);
  });
}

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

export const parseImageFile = async (file: File, registry: DriverRegistry): Promise<{ routes: RouteData[], batchInfo: BatchInfo }> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const imagePart = await fileToGenerativePart(file);

  const prompt = `
    Extract driver dispatch data from this screenshot of a UniUni dashboard ("YOW 取货表").

    1. Look for global metadata at the top:
       - "发货日期" (Dispatch Date) -> extract as date (e.g., 2026-07-03)
       - "发货批次" (Batch ID) -> extract as batchId (e.g., OSUB-202607012041)

    2. Extract the table. For each row:
       - "路线号" (Route #) -> routeNum (e.g., 33011)
       - "货量" (Volume) -> totalVolume
       - "扫单号" (Scan ID) -> scanId
       - "预派发规则" (Allocation Rules) -> parse into the segments array (see below)
       - "时间" (Time) -> timeSlot only if visible; don't guess.

    THE MOST IMPORTANT COLUMN is "预派发规则". It contains comma-separated
    segments of the form "START-END(SUB_ROUTE)". You must parse EVERY segment
    into the segments array.

    Example: the cell "1-157(33011-2-1),158-288(33011-2-2)" becomes
      segments: [
        { "start": 1,   "end": 157, "subRoute": "33011-2-1" },
        { "start": 158, "end": 288, "subRoute": "33011-2-2" }
      ]

    Rules for segments:
    - subRoute is the COMPLETE text inside the parentheses, e.g. "33011-2-1"
      or "33022-4-3". Never shorten it.
    - The cell text often WRAPS ACROSS MULTIPLE LINES — read the whole cell
      and capture every segment before moving to the next row.
    - Self-check: the number of segments must equal the "拆分份数" (split
      count) column of the same row. If they don't match, re-read the cell.

    Return a JSON object with batchId (string), date (string),
    and rows (array of route objects with routeNum, totalVolume, scanId, segments).
  `;

  const response: GenerateContentResponse = await generateWithRetry(ai, {
    contents: { parts: [imagePart, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      temperature: 0,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          batchId: { type: Type.STRING },
          date: { type: Type.STRING },
          rows: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                routeNum: { type: Type.STRING },
                totalVolume: { type: Type.NUMBER },
                segments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      start:    { type: Type.NUMBER, description: "Segment range start, e.g. 1" },
                      end:      { type: Type.NUMBER, description: "Segment range end, e.g. 157" },
                      subRoute: { type: Type.STRING, description: "Complete text inside the parentheses, e.g. '33011-2-1'" }
                    },
                    required: ["start", "end", "subRoute"]
                  }
                },
                allocationString: { type: Type.STRING, description: "Backup: the raw 预派发规则 cell text" },
                scanId: { type: Type.STRING },
                timeSlot: { type: Type.STRING },
              },
              required: ["routeNum", "totalVolume", "segments"]
            }
          }
        },
        required: ["rows"]
      }
    }
  });

  const rawResult = JSON.parse(response.text || "{}");
  const extractedRows = rawResult.rows || [];
  const routes: RouteData[] = [];
  let totalVolumeAccumulated = 0;

  // Use extracted date or today as fallback
  let displayDate = rawResult.date || '';
  if (!displayDate) {
    displayDate = getOttawaTodayDateString();
  }

  extractedRows.forEach((item: any, idx: number) => {
    const baseRoute = String(item.routeNum || '').trim();
    if (!/^33\d{3}/.test(baseRoute)) return;

    totalVolumeAccumulated += (item.totalVolume || 0);
    // Prefer the structured segments from the model; fall back to regex-parsing
    // the raw cell text if they're missing or malformed.
    const structured = Array.isArray(item.segments)
      ? item.segments
          .filter((s: any) => typeof s?.start === 'number' && typeof s?.end === 'number' && String(s?.subRoute || '').trim() !== '')
          .map((s: any) => ({ start: s.start, end: s.end, ident: String(s.subRoute).trim() }))
      : [];
    const segments = structured.length > 0 ? structured : parseAllocationSegments(item.allocationString || '');

    // Fallback time slot based on baseRoute and dynamic date mechanism
    const defaultTime = getDefaultTimeSlot(baseRoute, displayDate);
    const finalTimeSlot = item.timeSlot || defaultTime;

    if (segments.length > 0) {
      segments.forEach((seg, sIdx) => {
        const volume = seg.end - seg.start + 1;
        let finalRouteNum = '';
        let location = 'Unknown';
        let driverId = seg.ident;
        let driverName = 'Unassigned';
        let driverGroup = 'Unassigned';

        if (seg.ident.includes('-')) {
          finalRouteNum = seg.ident;
          const parts = seg.ident.split('-');
          if (parts.length >= 3) {
            const base = parts[0];
            const zoneIdx = parts[parts.length - 1];
            location = ZONE_NAMES[`${base}-${zoneIdx}`] || 'Unknown';
          }
        } else {
          const driverEntry = registry[seg.ident];
          driverName = driverEntry?.name || `Driver ${seg.ident}`;
          driverGroup = driverEntry?.group || 'Unassigned';
          finalRouteNum = `${baseRoute}-${sIdx + 1}`;
          location = ZONE_NAMES[`${baseRoute}-${sIdx + 1}`] || 'Unknown';
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
          scanId: item.scanId || SCAN_ID_MAP[baseRoute] || '????'
        });
      });
    } else {
      routes.push({
        id: `IMG-SINGLE-${baseRoute}-${idx}`,
        driver: 'Unassigned',
        driverId: '',
        driverName: 'Unassigned',
        driverGroup: 'Unassigned',
        routeNum: baseRoute,
        routeLocation: ZONE_NAMES[baseRoute] || 'Unknown',
        timeSlot: finalTimeSlot,
        orderVolume: item.totalVolume || 0,
        scanId: item.scanId || SCAN_ID_MAP[baseRoute] || '????'
      });
    }
  });

  return {
    routes,
    batchInfo: {
      date: displayDate,
      batchId: rawResult.batchId || ('IMG-EXTRACT-' + Date.now()),
      totalVolume: totalVolumeAccumulated
    }
  };
};