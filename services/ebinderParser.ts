import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { EbinderData, EbinderDriverRow, normalizeEbinderDate } from "../types";
import { getApiKey } from "./apiKey";

async function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string; mimeType: string } }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({ inlineData: { data: base64Data, mimeType: file.type } });
    };
    reader.onerror = () => reject(new Error('文件读取失败，请重试'));
    reader.readAsDataURL(file);
  });
}

export async function parseEbinderImage(file: File): Promise<EbinderData> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const imagePart = await fileToGenerativePart(file);

  const prompt = `
    You are analyzing a weekly driver scheduling spreadsheet called "e-binder".

    The spreadsheet structure:
    - Column B: Driver ID (numeric only, e.g. 19492, 4574, 3261)
    - Column C: Driver name (e.g. Fath, Sijiang, Sam)
    - Column D: Notes or preferred routes (ignore)
    - Column E: MAX parcel capacity (numeric, e.g. 300, 250, 200, 150). Use null if empty or "N/A".
    - Remaining columns: date headers like "6-29", "6-30", "7-1", "7-2", "7-3", "7-4", "7-5"
      Each date cell for a driver is either:
      - WORKING: cell is light green / empty / has the driver name or a checkmark
      - OFF: cell has a RED or PINK background (even with NO text), AND/OR contains text like
        "6.23 off", "7.5 off", "0705 off" (4-digit MMDD), "off", "OFF", "of" (common typo for off), "休"

    Your task:
    1. Find all date column headers (like "6-29", "7-5" etc.) and list them as weekDates.
    2. For each driver row where Column B has a numeric ID:
       - Extract driverId (Column B, numbers only as string)
       - Extract driverName (Column C)
       - Extract maxCapacity (Column E as number, or null)
       - For each date column: determine if the driver is OFF that day.
         Collect ONLY the dates when the driver is OFF into offDates array.
         If the driver works all week, offDates = [].

    OFF detection rules (critical):
    - A cell with a solid RED/PINK background counts as OFF for that date column,
      even if the cell contains no text at all.
    - If the ENTIRE row of date cells is red, the driver is off ALL week:
      offDates must include every date in weekDates.
    - Text like "0705 off" or "0704 of" means off on 07-05 / 07-04 (MMDD digits).
      Map it to the matching column header date.
    - Notes that are NOT off markers must be IGNORED: route preferences like "Route 1.1",
      location notes, or any text without "off"/"of"/"休" in a non-red cell means WORKING.

    IMPORTANT:
    - Skip any row that doesn't have a numeric driver ID in Column B (skip headers, totals, empty rows).
    - offDates should contain the date strings exactly as they appear in the column headers (e.g. "7-5").
    - Keep drivers in the SAME order as the rows appear in the spreadsheet (top to bottom).
  `;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
        ? d.offDates
            .map((s: any) => {
              const norm = normalizeEbinderDate(String(s));
              return norm ? `${norm.m}-${norm.d}` : '';
            })
            .filter((s: string) => s !== '')
        : []
    }));

  const weekDates = Array.isArray(raw.weekDates) ? raw.weekDates.map(String) : [];

  if (weekDates.length === 0) {
    throw new Error('未能识别任何日期列（如"6-22"、"6-23"）。请确认上传的是 e-binder 班表截图，且截图包含完整列标题行。');
  }
  if (drivers.length === 0) {
    throw new Error('未能识别任何司机行。请确认截图中 B 列有纯数字司机 ID，且图片清晰完整。');
  }

  return {
    weekDates,
    drivers,
    parsedAt: Date.now()
  };
}
