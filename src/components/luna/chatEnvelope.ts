const IMAGE_ENVELOPE_PREFIX = "[[LUNA_IMAGE_V1]]";

export type LunaImageEnvelope = {
  type: "image_message";
  text: string;
  imageDataUrl: string;
  mimeType?: string;
  fileName?: string;
};

export function createLunaImageEnvelope(payload: LunaImageEnvelope): string {
  return `${IMAGE_ENVELOPE_PREFIX}${JSON.stringify(payload)}`;
}

export function parseLunaImageEnvelope(
  message: string
): LunaImageEnvelope | null {
  if (!message.startsWith(IMAGE_ENVELOPE_PREFIX)) return null;
  const raw = message.slice(IMAGE_ENVELOPE_PREFIX.length).trim();
  try {
    const parsed = JSON.parse(raw) as Partial<LunaImageEnvelope>;
    if (
      parsed.type !== "image_message" ||
      typeof parsed.imageDataUrl !== "string"
    ) {
      return null;
    }
    return {
      type: "image_message",
      text: typeof parsed.text === "string" ? parsed.text : "",
      imageDataUrl: parsed.imageDataUrl,
      mimeType: typeof parsed.mimeType === "string" ? parsed.mimeType : undefined,
      fileName: typeof parsed.fileName === "string" ? parsed.fileName : undefined
    };
  } catch {
    return null;
  }
}

