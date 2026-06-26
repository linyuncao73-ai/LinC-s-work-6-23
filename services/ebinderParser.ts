import { EbinderData, EbinderDriverRow } from "../types";
import { invokeGeminiParse, fileToBase64 } from "./geminiProxy";

export async function parseEbinderImage(file: File): Promise<EbinderData> {
  // Gemini Vision runs server-side in the Edge Function; the key stays off the
  // client. We upload the image and receive the structured JSON back.
  const imageBase64 = await fileToBase64(file);
  const raw = await invokeGeminiParse("ebinder", imageBase64, file.type);

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
