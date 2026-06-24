import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { EbinderData, EbinderDriverRow } from "../types";

async function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string; mimeType: string } }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({ inlineData: { data: base64Data, mimeType: file.type } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function parseEbinderImage(file: File): Promise<EbinderData> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const imagePart = await fileToGenerativePart(file);

  const prompt = `
    You are analyzing a weekly driver scheduling spreadsheet called "e-binder".

    The spreadsheet structure:
    - Column B: Driver ID (numeric only, e.g. 19492, 4574, 3261)
    - Column C: Driver name (e.g. Fath, Sijiang, Sam)
    - Column D: Notes or preferred routes (ignore)
    - Column E: MAX parcel capacity (numeric, e.g. 300, 250, 200, 150). Use null if empty or "N/A".
    - Remaining columns: date headers like "6-22", "6-23", "6-24", "6-25", "6-26", "6-27", "6-28"
      Each date cell for a driver is either:
      - WORKING: cell is green/empty/has the driver name or a checkmark
      - OFF: cell is red/pink AND/OR contains text like "6.23 off", "off", "OFF", "休"

    Your task:
    1. Find all date column headers (like "6-22", "6-23" etc.) and list them as weekDates.
    2. For each driver row where Column B has a numeric ID:
       - Extract driverId (Column B, numbers only as string)
       - Extract driverName (Column C)
       - Extract maxCapacity (Column E as number, or null)
       - For each date column: determine if the driver is OFF that day.
         Look for text like "6.23 off", "off", red background, or similar indicators.
         Collect ONLY the dates when the driver is OFF into offDates array.
         If the driver works all week, offDates = [].

    IMPORTANT:
    - Skip any row that doesn't have a numeric driver ID in Column B (skip headers, totals, empty rows).
    - offDates should contain the date strings exactly as they appear in the column headers (e.g. "6-23").
    - If a cell has text like "6.23 off", the date is "6-23" (normalize dots to dashes).
  `;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview",
    contents: { parts: [imagePart, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          weekDates: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Date column headers found, e.g. ['6-22','6-23','6-24','6-25','6-26','6-27']"
          },
          drivers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                driverId:    { type: Type.STRING },
                driverName:  { type: Type.STRING },
                maxCapacity: { type: Type.NUMBER },
                offDates:    { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["driverId", "driverName", "offDates"]
            }
          }
        },
        required: ["weekDates", "drivers"]
      }
    }
  });

  const raw = JSON.parse(response.text || "{}");

  const drivers: EbinderDriverRow[] = (raw.drivers || [])
    .filter((d: any) => /^\d+$/.test(String(d.driverId || '').trim()))
    .map((d: any) => ({
      driverId:    String(d.driverId).trim(),
      driverName:  String(d.driverName || ''),
      maxCapacity: typeof d.maxCapacity === 'number' && d.maxCapacity > 0 ? d.maxCapacity : null,
      offDates:    Array.isArray(d.offDates)
        ? d.offDates.map((s: any) => String(s).replace('.', '-').trim())
        : []
    }));

  return {
    weekDates: Array.isArray(raw.weekDates) ? raw.weekDates.map(String) : [],
    drivers,
    parsedAt: Date.now()
  };
}
