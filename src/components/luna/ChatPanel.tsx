import { useMemo, useRef, useState } from "react";
import { ImagePlus, SendHorizontal, X } from "lucide-react";
import { useSessionMessages } from "@livekit/components-react";
import { toast } from "sonner";
import { AgentChatTranscript } from "@/components/agents/agent-chat-transcript";
import { Input } from "@/components/ui/input";
import { createLunaImageEnvelope } from "@/components/luna/chatEnvelope";
import { useGlobalAgentState } from "@/components/luna/GlobalAgentState";

const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;

export function ChatPanel() {
  const { agentState } = useGlobalAgentState();
  const { messages, send, isSending } = useSessionMessages();
  const [value, setValue] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [imageMimeType, setImageMimeType] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stateText = useMemo(() => agentState.toLowerCase(), [agentState]);

  const onSend = async () => {
    const text = value.trim();
    if (!text && !imageDataUrl) return;

    if (imageDataUrl) {
      await send(
        createLunaImageEnvelope({
          type: "image_message",
          text,
          imageDataUrl,
          mimeType: imageMimeType,
          fileName: imageName
        })
      );
      setImageDataUrl(null);
      setImageName("");
      setImageMimeType("");
      setValue("");
      return;
    }

    await send(text);
    setValue("");
  };

  const onPickImage = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please attach an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error("Image is too large. Please use an image up to 4MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        toast.error("Failed to read image file.");
        return;
      }
      setImageDataUrl(result);
      setImageName(file.name);
      setImageMimeType(file.type);
    };
    reader.onerror = () => {
      toast.error("Failed to load image.");
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex h-full flex-col bg-[#111111]">
      <div className="flex items-center justify-between border-b border-[#222222] px-5 py-4">
        <p className="text-sm font-semibold text-zinc-100">Chat</p>
        <p className="text-xs text-zinc-400">{stateText}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <AgentChatTranscript
          agentState={agentState}
          messages={messages}
          className="[&_button]:border-zinc-700 [&_.is-assistant]:text-zinc-200 [&_.is-user]:text-zinc-100"
        />
      </div>
      <div className="border-t border-[#222222] p-4">
        {imageDataUrl && (
          <div className="mb-3 rounded-lg border border-[#2d2d2d] bg-[#161616] p-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="truncate text-xs text-zinc-300">{imageName || "Attached image"}</p>
              <button
                className="rounded p-1 text-zinc-400 hover:bg-[#222222] hover:text-zinc-200"
                onClick={() => {
                  setImageDataUrl(null);
                  setImageName("");
                  setImageMimeType("");
                }}
                title="Remove image"
              >
                <X size={14} />
              </button>
            </div>
            <img src={imageDataUrl} alt="Attachment preview" className="max-h-40 rounded-md object-contain" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
          />
          <button
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[#2b2b2b] bg-[#181818] text-zinc-200 hover:bg-[#222222]"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
            disabled={isSending}
          >
            <ImagePlus size={16} />
          </button>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={imageDataUrl ? "Add a prompt for this image (optional)..." : "Type a message..."}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
          />
          <button
            className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-60"
            onClick={() => void onSend()}
            disabled={isSending || (!value.trim() && !imageDataUrl)}
          >
            <SendHorizontal size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
