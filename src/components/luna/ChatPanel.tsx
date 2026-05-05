import { useMemo, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { useAgent, useSessionMessages } from "@livekit/components-react";
import { AgentChatTranscript } from "@/components/agents/agent-chat-transcript";
import { Input } from "@/components/ui/input";

export function ChatPanel() {
  const agent = useAgent();
  const { messages, send, isSending } = useSessionMessages();
  const [value, setValue] = useState("");
  const stateText = useMemo(() => agent.state.toLowerCase(), [agent.state]);

  const onSend = async () => {
    const text = value.trim();
    if (!text) return;
    await send(text);
    setValue("");
  };

  return (
    <div className="flex h-full flex-col bg-[#111111]">
      <div className="flex items-center justify-between border-b border-[#222222] px-5 py-4">
        <p className="text-sm font-semibold text-zinc-100">Transcript</p>
        <p className="text-xs text-zinc-400">{stateText}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <AgentChatTranscript
          agentState={agent.state}
          messages={messages}
          className="[&_button]:border-zinc-700 [&_.is-assistant]:text-zinc-200 [&_.is-user]:text-zinc-100"
        />
      </div>
      <div className="border-t border-[#222222] p-4">
        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type a message..."
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
            disabled={isSending}
          >
            <SendHorizontal size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
