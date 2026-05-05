import { Loader2 } from "lucide-react";

export function LunaConnecting() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-indigo-500" />
        <p className="mt-4 text-sm text-muted">Connecting to Luna...</p>
      </div>
    </div>
  );
}
