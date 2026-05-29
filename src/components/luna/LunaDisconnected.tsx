import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, Zap } from "lucide-react";

type Props = {
  isConfigured: boolean;
  isConnecting: boolean;
  onConnect?: () => void;
};

export function LunaDisconnected({ isConfigured, isConnecting, onConnect }: Props) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="mx-auto max-w-xl px-6 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-white/5 bg-zinc-900 text-zinc-500">
          <Zap size={32} />
        </div>
        <h1 className="bg-gradient-to-r from-indigo-400 to-indigo-600 bg-clip-text text-6xl font-extrabold text-transparent">
          Luna
        </h1>
        <p className="mt-4 text-sm text-muted">
          {isConfigured && onConnect
            ? "Luna is offline but ready to connect."
            : isConfigured
              ? "Connecting to your session..."
              : "Finish setup to enable your personal assistant."}
        </p>
        {!isConfigured ? (
          <div className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-left text-amber-200">
            <p className="text-sm font-medium">Configuration required</p>
            <p className="mt-1 text-xs text-amber-200/70">
              Go to{" "}
              <Link className="text-amber-100 underline" to="/settings">
                Settings &gt; Agent
              </Link>{" "}
              to enter your LiveKit credentials.
            </p>
          </div>
        ) : (
          <Button
            onClick={onConnect}
            disabled={isConnecting}
            className="mt-8 h-12 min-w-52 bg-indigo-600 text-base hover:bg-indigo-500"
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect Luna"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
