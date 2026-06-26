import { DriverRegistry, RouteData, BatchInfo } from "../types";
import { invokeGeminiParse, fileToBase64 } from "./geminiProxy";
import { mapImageResultToRoutes } from "./geminiMapping";

export const parseImageFile = async (file: File, registry: DriverRegistry): Promise<{ routes: RouteData[], batchInfo: BatchInfo }> => {
  // Gemini Vision runs server-side in the Edge Function; the key never touches
  // the browser. We only upload the image and get back the structured JSON,
  // then map it to dispatch rows locally (see geminiMapping.ts).
  const imageBase64 = await fileToBase64(file);
  const rawResult = await invokeGeminiParse("image", imageBase64, file.type);
  return mapImageResultToRoutes(rawResult, registry);
};
