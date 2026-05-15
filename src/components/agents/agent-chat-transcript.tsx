import { type ComponentProps } from 'react';
import { type AgentState, type ReceivedMessage } from '@livekit/components-react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/agents/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/agents/message';
import { AgentChatIndicator } from '@/components/agents/agent-chat-indicator';
import { AnimatePresence } from 'motion/react';
import { parseLunaImageEnvelope } from '@/components/luna/chatEnvelope';

/**
 * Props for the AgentChatTranscript component.
 */
export interface AgentChatTranscriptProps extends ComponentProps<'div'> {
  /**
   * The current state of the agent. When 'thinking', displays a loading indicator.
   */
  agentState?: AgentState;
  /**
   * Array of messages to display in the transcript.
   * @defaultValue []
   */
  messages?: ReceivedMessage[];
  /**
   * Additional CSS class names to apply to the conversation container.
   */
  className?: string;
}

/**
 * A chat transcript component that displays a conversation between the user and agent.
 * Shows messages with timestamps and origin indicators, plus a thinking indicator
 * when the agent is processing.
 *
 * @extends ComponentProps<'div'>
 *
 * @example
 * ```tsx
 * <AgentChatTranscript
 *   agentState={agentState}
 *   messages={chatMessages}
 * />
 * ```
 */
export function AgentChatTranscript({
  agentState,
  messages = [],
  className,
  ...props
}: AgentChatTranscriptProps) {
  return (
    <Conversation className={className} {...props}>
      <ConversationContent>
        {messages.map((receivedMessage) => {
          const { id, timestamp, from, message } = receivedMessage;
          const imageEnvelope = parseLunaImageEnvelope(message);
          const time = new Date(timestamp);
          const messageOrigin = from?.isLocal ? 'user' : 'assistant';
          const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
          const title = time.toLocaleTimeString(locale, { timeStyle: 'full' });

          return (
            <Message key={id} title={title} from={messageOrigin}>
              <MessageContent>
                {imageEnvelope ? (
                  <div className="space-y-2">
                    {imageEnvelope.text ? <MessageResponse>{imageEnvelope.text}</MessageResponse> : null}
                    <img
                      src={imageEnvelope.imageDataUrl}
                      alt={imageEnvelope.fileName || 'Attached image'}
                      className="max-h-56 rounded-md border border-zinc-700 object-contain"
                    />
                  </div>
                ) : (
                  <MessageResponse>{message}</MessageResponse>
                )}
              </MessageContent>
            </Message>
          );
        })}
        <AnimatePresence>
          {agentState === 'thinking' && <AgentChatIndicator size="sm" />}
        </AnimatePresence>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
