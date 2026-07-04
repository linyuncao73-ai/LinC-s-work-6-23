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

    The spreadsheet structure:
    - Column B: Driver ID (numeric only, e.g. 19492, 4574, 3261)
    - Column C: Driver name (e.g. Fath, Sijiang, Sam)
    - Column D: Notes or preferred routes (ignore)
    - Column E: MAX parcel capacity (numeric, e.g. 300, 250, 200, 150). Use null if empty or "N/A".
    - Remaining columns: date headers like "6-29", "6-30", "7-1", "7-2", "7-3", "7-4", "7-5"

    Your task:
    1. Find all date column headers (like "6-29", "7-5" etc.) and list them as weekDates.
    2. For each driver row where Column B has a numeric ID, extract:
       - driverId (Column B, numbers only as string)
       - driverName (Column C)
       - maxCapacity (Column E as number, or null)
       - offDays: the dates this driver is OFF, each with the evidence you saw.

    THE DEFAULT IS WORKING. A light green or empty date cell ALWAYS means the driver
    works that day. Most drivers work the entire week — being off is the exception.
    Only report a date in offDays when you can see explicit evidence IN THAT DRIVER'S
    OWN ROW:
    - The cell has a solid RED or PINK background (with or without text), OR
    - The cell contains off text: "off", "OFF", "of" (typo), "休", "7.5 off",
      "0705 off" (4-digit MMDD), "6.23 off", etc.

    For each offDays entry output:
    - date: the column header date (e.g. "7-5")
    - evidence: exactly what you saw — the cell's text (e.g. "0705 off"),
      or "red cell" if the cell is red/pink with no text.

    CRITICAL — avoid these mistakes:
    - Process ONE ROW AT A TIME. A red cell in one driver's row must NEVER cause a
      neighboring row's driver to be marked off. Before adding an offDays entry,
      re-check that the red cell or off text is on the same horizontal row as that
      driver's ID.
    - Route notes are NOT off markers: text like "Route 1.1" or a preferred-route
      note in a green cell means the driver WORKS that day.
    - If the ENTIRE row of date cells is red, include every weekDate in offDays
      with evidence "red cell".

    IMPORTANT:
    - Skip any row that doesn't have a numeric driver ID in Column B (skip headers, totals, empty rows).
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
                offDays: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      date:     { type: Type.STRING, description: "Column header date, e.g. '7-5'" },
                      evidence: { type: Type.STRING, description: "Cell text seen, or 'red cell' for a red/pink cell with no text" }
                    },
                    required: ["date", "evidence"]
                  }
                }
              },
              required: ["driverId", "driverName", "offDays"]
            }
          }
        },
        required: ["weekDates", "drivers"]
      }
    }
  });

  const raw = JSON.parse(response.text || "{}");

  // Only trust off entries whose evidence is an actual off marker; this drops
  // hallucinated entries and notes like "Route 1.1" that slipped through.
  const isOffEvidence = (ev: string) => /red|pink|\boff?\b|休/i.test(ev);

  const drivers: EbinderDriverRow[] = (raw.drivers || [])
    .filter((d: any) => /^\d+$/.test(String(d.driverId || '').trim()))
    .map((d: any) => ({
      driverId:    String(d.driverId).trim(),
      driverName:  String(d.driverName || ''),
      maxCapacity: typeof d.maxCapacity === 'number' && d.maxCapacity > 0 ? d.maxCapacity : null,
      offDates:    Array.isArray(d.offDays)
        ? d.offDays
            .filter((o: any) => o && isOffEvidence(String(o.evidence || '')))
            .map((o: any) => {
              const norm = normalizeEbinderDate(String(o.date));
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
