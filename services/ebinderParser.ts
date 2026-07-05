import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { EbinderData, EbinderDriverRow, normalizeEbinderDate } from "../types";
import { getApiKey } from "./apiKey";
import { generateWithRetry } from "./geminiClient";

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

    Business context: a RED (or pink) BACKGROUND on a date cell is the driver's
    FIXED weekly day off — the company wipes all text from the sheet every week,
    but the red backgrounds stay. So a red cell usually has NO text at all, and
    it always means the driver does not work that day. Text markers like
    "7.6 off" are additional one-time leave notes.

    The spreadsheet structure:
    - Column B: Driver ID (numeric only, e.g. 19492, 4574, 3261)
    - Column C: Driver name (e.g. Fath, Sijiang, Sam)
    - Column D: Notes or preferred routes (ignore)
    - Column E: MAX parcel capacity (numeric, e.g. 300, 250, 200, 150). Use null if empty or "N/A".
    - Remaining columns: date headers like "7-6", "7-7", "7-8", "7-9", "7-10", "7-11", "7-12"

    Your task:
    1. Find all date column headers and list them as weekDates, left to right.
    2. For each driver row where Column B has a numeric ID, extract:
       - driverId (Column B, numbers only as string)
       - driverName (Column C)
       - maxCapacity (Column E as number, or null)
       - dayColors: walk that driver's date cells LEFT TO RIGHT and classify the
         BACKGROUND COLOR of every single cell. Output exactly ONE entry per
         weekDate, in the same order as weekDates:
           "red"   — the cell background is red or pink (with or without text)
           "green" — anything else (green, empty, white, or a text note)
         Do NOT skip any cell. dayColors.length must equal weekDates.length.
       - offTextDates: dates whose cell contains off text such as "off", "OFF",
         "of" (typo), "休", "7.6 off", "0706 off" (4-digit MMDD). Convert each to
         the column header date (e.g. "7.6 off" -> "7-6"). Empty array if none.
         Route notes like "Route 1.1" are NOT off text — ignore them.

    CRITICAL:
    - Classify each row independently: a red cell in one driver's row must never affect
      the row above or below it. Stay on the same horizontal row as the driver ID.
    - Skip any row that doesn't have a numeric driver ID in Column B (headers, totals, empty rows).
    - Keep drivers in the SAME order as the rows appear in the spreadsheet (top to bottom).
  `;

  const response: GenerateContentResponse = await generateWithRetry(ai, {
    contents: { parts: [imagePart, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      temperature: 0,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          weekDates: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Date column headers found, e.g. ['6-29','6-30','7-1','7-2','7-3','7-4','7-5']"
          },
          drivers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                driverId:    { type: Type.STRING },
                driverName:  { type: Type.STRING },
                maxCapacity: { type: Type.NUMBER },
                dayColors: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING, enum: ["red", "green"] },
                  description: "One background-color classification per weekDate, in weekDates order. Length must equal weekDates length."
                },
                offTextDates: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Column header dates whose cell contains off text, e.g. ['7-6']. Empty if none."
                }
              },
              required: ["driverId", "driverName", "dayColors"]
            }
          }
        },
        required: ["weekDates", "drivers"]
      }
    }
  });

  const raw = JSON.parse(response.text || "{}");

  const weekDates: string[] = Array.isArray(raw.weekDates) ? raw.weekDates.map(String) : [];

  const drivers: EbinderDriverRow[] = (raw.drivers || [])
    .filter((d: any) => /^\d+$/.test(String(d.driverId || '').trim()))
    .map((d: any) => {
      const offDates = new Set<string>();
      // Red cells: one classification per date column, aligned with weekDates
      const colors: string[] = Array.isArray(d.dayColors) ? d.dayColors : [];
      const len = Math.min(colors.length, weekDates.length);
      for (let i = 0; i < len; i++) {
        if (String(colors[i]).toLowerCase() === 'red') {
          const norm = normalizeEbinderDate(weekDates[i]);
          if (norm) offDates.add(`${norm.m}-${norm.d}`);
        }
      }
      // One-time leave written as text, e.g. "7.6 off"
      if (Array.isArray(d.offTextDates)) {
        for (const s of d.offTextDates) {
          const norm = normalizeEbinderDate(String(s));
          if (norm) offDates.add(`${norm.m}-${norm.d}`);
        }
      }
      return {
        driverId:    String(d.driverId).trim(),
        driverName:  String(d.driverName || ''),
        maxCapacity: typeof d.maxCapacity === 'number' && d.maxCapacity > 0 ? d.maxCapacity : null,
        offDates:    [...offDates],
      };
    });

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
