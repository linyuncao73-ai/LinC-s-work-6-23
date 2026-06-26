import { supabase, isSupabaseConfigured } from "./supabaseClient";

/**
 * Frontend → Edge Function bridge for Gemini Vision parsing.
 *
 * The GEMINI_API_KEY no longer lives in the browser bundle. Image parsing now
 * goes through the `gemini-parse` Supabase Edge Function, which holds the key
 * as a server-side secret. This module just uploads the image and returns the
 * raw structured JSON; all app-specific mapping stays in the caller.
 */

export type GeminiParseOp = "image" | "ebinder";

/** Read a File into a base64 string (without the data: URL prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Invoke the gemini-parse Edge Function and return the raw Gemini JSON. */
export async function invokeGeminiParse(
  op: GeminiParseOp,
  imageBase64: string,
  mimeType: string,
): Promise<any> {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase 未配置：截图解析需要 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，" +
      "并且已部署 gemini-parse Edge Function（GEMINI_API_KEY 作为服务端 secret）。",
    );
  }

  const { data, error } = await supabase.functions.invoke("gemini-parse", {
    body: { op, imageBase64, mimeType },
  });

  if (error) {
    throw new Error(`图片解析失败（Edge Function）：${error.message}`);
  }
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(`图片解析失败：${(data as { error: string }).error}`);
  }
  return data ?? {};
}
