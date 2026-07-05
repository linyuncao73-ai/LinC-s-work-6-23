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

interface PixelImage { data: Uint8ClampedArray; width: number; height: number }

async function fileToImageData(file: File): Promise<PixelImage | null> {
  try {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    return { data: img.data, width: img.width, height: img.height };
  } catch {
    return null;
  }
}

/** Averages a 7x7 patch around (cx, cy) and decides if it's a red/pink cell. */
function isRedAt(img: PixelImage, cx: number, cy: number): boolean {
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = Math.min(img.width - 1, Math.max(0, Math.round(cx + dx)));
      const y = Math.min(img.height - 1, Math.max(0, Math.round(cy + dy)));
      const i = (y * img.width + x) * 4;
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
    }
  }
  r /= n; g /= n; b /= n;
  // Sheet red is vivid (#FF0000-ish); green data cells are #B6D7A8-ish.
  return r > 150 && r - g > 50 && r - b > 50;
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

    COORDINATES: all coordinates are normalized to 0-1000 relative to the full
    image (x: left edge = 0, right edge = 1000; y: top = 0, bottom = 1000).

    Your task:
    1. Find all date column headers, left to right. For each output:
       - date: the header text (e.g. "7-6")
       - xmin / xmax: the horizontal span of that column (normalized 0-1000)
    2. For each driver row where Column B has a numeric ID, extract:
       - driverId (Column B, numbers only as string)
       - driverName (Column C)
       - maxCapacity (Column E as number, or null)
       - ymin / ymax: the vertical span of that driver's own row (normalized
         0-1000) — measure the row band of the cell containing the driver ID.
       - dayColors: walk that driver's date cells LEFT TO RIGHT and classify the
         BACKGROUND COLOR of every single cell. Output exactly ONE entry per
         date column, in the same order:
           "red"   — the cell background is red or pink (with or without text)
           "green" — anything else (green, empty, white, or a text note)
       - offTextDates: dates whose cell contains off text such as "off", "OFF",
         "of" (typo), "休", "7.6 off", "0706 off" (4-digit MMDD). Convert each to
         the column header date (e.g. "7.6 off" -> "7-6"). Empty array if none.
         Route notes like "Route 1.1" are NOT off text — ignore them.

    CRITICAL:
    - ymin/ymax must be accurate: they are used to locate each driver's row.
      Adjacent rows must not overlap.
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
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING, description: "Header text, e.g. '7-6'" },
                xmin: { type: Type.NUMBER, description: "Left edge of the column, normalized 0-1000" },
                xmax: { type: Type.NUMBER, description: "Right edge of the column, normalized 0-1000" }
              },
              required: ["date", "xmin", "xmax"]
            },
            description: "Date column headers left to right with their horizontal spans"
          },
          drivers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                driverId:    { type: Type.STRING },
                driverName:  { type: Type.STRING },
                maxCapacity: { type: Type.NUMBER },
                ymin: { type: Type.NUMBER, description: "Top edge of this driver's row, normalized 0-1000" },
                ymax: { type: Type.NUMBER, description: "Bottom edge of this driver's row, normalized 0-1000" },
                dayColors: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING, enum: ["red", "green"] },
                  description: "One background-color classification per date column, in order"
                },
                offTextDates: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Column header dates whose cell contains off text, e.g. ['7-6']. Empty if none."
                }
              },
              required: ["driverId", "driverName", "ymin", "ymax", "dayColors"]
            }
          }
        },
        required: ["weekDates", "drivers"]
      }
    }
  });

  const raw = JSON.parse(response.text || "{}");

  const weekCols: { date: string; xmin: number; xmax: number }[] = Array.isArray(raw.weekDates)
    ? raw.weekDates
        .map((w: any) => (typeof w === 'string'
          ? { date: w, xmin: NaN, xmax: NaN }
          : { date: String(w?.date || ''), xmin: Number(w?.xmin), xmax: Number(w?.xmax) }))
        .filter((w: any) => w.date !== '')
    : [];
  const weekDates: string[] = weekCols.map(w => w.date);

  // Red detection is done by sampling the actual pixels: the model only
  // locates rows/columns, so a red block spanning two driver rows can't be
  // attributed to just one of them. Model dayColors remain the fallback.
  const img = await fileToImageData(file);
  const colValid = (w: { xmin: number; xmax: number }) => Number.isFinite(w.xmin) && Number.isFinite(w.xmax) && w.xmax > w.xmin;

  const drivers: EbinderDriverRow[] = (raw.drivers || [])
    .filter((d: any) => /^\d+$/.test(String(d.driverId || '').trim()))
    .map((d: any) => {
      const offDates = new Set<string>();
      const rowValid = img && Number.isFinite(Number(d.ymin)) && Number.isFinite(Number(d.ymax)) && Number(d.ymax) > Number(d.ymin);
      const modelColors: string[] = Array.isArray(d.dayColors) ? d.dayColors : [];

      for (let i = 0; i < weekCols.length; i++) {
        const col = weekCols[i];
        let red: boolean;
        if (rowValid && colValid(col)) {
          const cx = ((col.xmin + col.xmax) / 2 / 1000) * img!.width;
          const cy = ((Number(d.ymin) + Number(d.ymax)) / 2 / 1000) * img!.height;
          red = isRedAt(img!, cx, cy);
        } else {
          red = String(modelColors[i] || '').toLowerCase() === 'red';
        }
        if (red) {
          const norm = normalizeEbinderDate(col.date);
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
