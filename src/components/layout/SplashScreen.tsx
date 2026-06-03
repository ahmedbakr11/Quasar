import { useEffect } from "react";
import { useRuntimeStore } from "@/store/runtimeStore";

export function SplashScreen() {
  const startupMessage = useRuntimeStore((s) => s.startupMessage);
  const startListeners = useRuntimeStore((s) => s.startListeners);

  useEffect(() => {
    void startListeners();
  }, [startListeners]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-transparent">
      <section className="flex h-[320px] w-[480px] flex-col items-center justify-center rounded-lg border border-white/10 bg-black/70 shadow-2xl backdrop-blur-xl">
        <img
          src="/icons.svg"
          alt="Quasar"
          className="mb-8 h-24 w-24 object-contain"
          draggable={false}
        />
        <div className="h-1 w-56 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-2/3 animate-[quasar-progress_1.4s_ease-in-out_infinite] rounded-full bg-cyan-300" />
        </div>
        <p className="mt-5 text-sm font-medium text-zinc-200">{startupMessage}</p>
      </section>
    </main>
  );
}
