import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

type Props = {
  isConfigured: boolean;
  onConnect: () => void;
};

export function LunaDisconnected({ isConfigured, onConnect }: Props) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="mx-auto max-w-xl px-6 text-center">
        <h1 className="bg-gradient-to-r from-indigo-400 to-indigo-600 bg-clip-text text-6xl font-extrabold text-transparent">
          Luna
        </h1>
        <p className="mt-4 text-sm text-muted">Connect to start talking with Luna</p>
        {!isConfigured ? (
          <div className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-left text-amber-200">
            <p className="text-sm font-medium">Agent not configured</p>
            <p className="mt-1 text-xs">
              Go to{" "}
              <Link className="text-amber-100 underline" to="/settings">
                Settings &gt; Agent
              </Link>{" "}
              to get started.
            </p>
          </div>
        ) : (
          <Button onClick={onConnect} className="mt-8 h-12 min-w-52 bg-indigo-500 text-base hover:bg-indigo-600">
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}
