import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : "Unknown render error";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    // Keep console signal for local debugging in Tauri webview.
    console.error("AppErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8">
          <div className="max-w-2xl rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            <p className="text-sm font-semibold">A render error occurred</p>
            <p className="mt-1 text-xs">{this.state.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
