import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { DriverRegistry, SCAN_ID_MAP, ZONE_NAMES, RouteData, BatchInfo, getDefaultTimeSlot, getOttawaTodayDateString } from "../types";

async function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string, mimeType: string } }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({
        inlineData: { data: base64Data, mimeType: file.type },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const parseAllocationSegments = (str: string) => {
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const imagePart = await fileToGenerativePart(file);

  const prompt = `
    Extract driver dispatch data from this screenshot of a UniUni dashboard.
    
    1. Look for global metadata at the top:
       - "发货日期" (Dispatch Date) -> extract as date (e.g., 2026-02-02)
       - "发货批次" (Batch ID) -> extract as batchId (e.g., OSUB-202601312218)
    
    2. Extract the table data. Mapping:
       - "路线号" (Route #) -> routeNum
       - "预派发规则" (Allocation Rules) -> allocationString
       - "扫单号" (Scan ID) -> scanId
       - "货量" (Volume) -> totalVolume
       - "时间" (Time) -> timeSlot
    
    CRITICAL INSTRUCTIONS:
    - "预派发规则" contains driver assignments like "1-22(20255), 23-50(15167)".
    - Route numbers start with '33' (e.g., 33055).
    - If you see placeholders like "33011-4-1" inside parentheses in the allocation column, extract it.
    - If "时间" (Time) is visible, extract it. If not, don't guess.
    
    Return a JSON object with:
    - batchId (string)
    - date (string)
    - rows (array of route objects)
  `;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: [imagePart, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
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
                allocationString: { type: Type.STRING },
                scanId: { type: Type.STRING },
                timeSlot: { type: Type.STRING },
              },
              required: ["routeNum", "allocationString", "totalVolume"]
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
    const segments = parseAllocationSegments(item.allocationString || '');

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