// Supabase Edge Function: gemini-parse
// ─────────────────────────────────────────────────────────────────────────────
// Thin server-side proxy for Gemini Vision. The GEMINI_API_KEY lives ONLY here
// (as an Edge Function secret) and never reaches the browser bundle.
//
// The prompts + response schemas are kept server-side on purpose: the frontend
// only chooses an operation ("image" or "ebinder") and uploads the picture, so
// the function can't be abused as an open arbitrary-prompt Gemini proxy by
// anyone holding the public anon key.
//
// Deploy:   supabase functions deploy gemini-parse
// Secret:   supabase secrets set GEMINI_API_KEY=xxxxx
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleGenAI, Type } from "npm:@google/genai@1.36.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Operation definitions (prompt + model + schema) ──────────────────────────
const OPS: Record<string, { model: string; prompt: string; schema: unknown }> = {
  image: {
    model: "gemini-3-flash-preview",
    prompt: `
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
  `,
    schema: {
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
            required: ["routeNum", "allocationString", "totalVolume"],
          },
        },
      },
      required: ["rows"],
    },
  },

  ebinder: {
    // gemini-2.5-flash-preview was retired (404 NOT_FOUND); use the same
    // current model as the image op.
    model: "gemini-3-flash-preview",
    prompt: `
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
  `,
    schema: {
      type: Type.OBJECT,
      properties: {
        weekDates: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            "Date column headers found, e.g. ['6-22','6-23','6-24','6-25','6-26','6-27']",
        },
        drivers: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              driverId: { type: Type.STRING },
              driverName: { type: Type.STRING },
              maxCapacity: { type: Type.NUMBER },
              offDates: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["driverId", "driverName", "offDates"],
          },
        },
      },
      required: ["weekDates", "drivers"],
    },
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json({ error: "GEMINI_API_KEY is not configured on the server" }, 500);
  }

  let payload: { op?: string; imageBase64?: string; mimeType?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { op, imageBase64, mimeType } = payload;
  if (!op || !OPS[op]) {
    return json({ error: `Unknown op "${op}". Expected "image" or "ebinder".` }, 400);
  }
  if (!imageBase64 || !mimeType) {
    return json({ error: "Missing imageBase64 or mimeType" }, 400);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const { model, prompt, schema } = OPS[op];
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }],
      },
      config: { responseMimeType: "application/json", responseSchema: schema },
    });
    // Return the raw structured JSON; all app-specific mapping stays in the frontend.
    return json(JSON.parse(response.text || "{}"), 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `Gemini request failed: ${msg}` }, 502);
  }
});
