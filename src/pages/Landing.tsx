import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeOnboarding, getOnboardingStatus } from "@/lib/tauriCommands";
import { useAuthStore } from "@/store/authStore";
import { useRuntimeStore } from "@/store/runtimeStore";

const lunaVoices = ["Puck", "Aoede", "Charon", "Fenrir", "Kore", "Orus", "Zephyr", "Gacrux"];
const defaultPersona =
  "You are Luna, a refined, poised AI companion. Be concise, calm, helpful, and direct. Address the user with warmth and precision.";

type Step = "landing" | "voice" | "persona" | "api" | "account";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Landing() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.sessionToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const restartLiveKit = useRuntimeStore((s) => s.restartLiveKit);
  const restartLuna = useRuntimeStore((s) => s.restartLuna);
  const [statusLoading, setStatusLoading] = useState(true);
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>("landing");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    voice: "Gacrux",
    persona: defaultPersona,
    googleApiKey: "",
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  useEffect(() => {
    void getOnboardingStatus()
      .then((status) => setIsFirstLaunch(status.isFirstLaunch))
      .catch((err) => {
        setIsFirstLaunch(true);
        toast.error(err instanceof Error ? err.message : "Could not inspect onboarding state.");
      })
      .finally(() => setStatusLoading(false));
  }, []);

  const accountError = useMemo(() => {
    if (!form.name.trim()) return "Name is required.";
    if (!emailPattern.test(form.email)) return "A valid email is required.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword) return "Passwords do not match.";
    return null;
  }, [form]);

  if (token) return <Navigate to="/dashboard" replace />;
  if (statusLoading) return <GalaxyShell><Loader2 className="h-5 w-5 animate-spin text-white" /></GalaxyShell>;
  if (isFirstLaunch === false) return <Navigate to="/login" replace />;

  const complete = async (event: FormEvent) => {
    event.preventDefault();
    if (accountError) return;

    setLoading(true);
    try {
      const result = await completeOnboarding({
        voice: form.voice,
        persona: form.persona,
        googleApiKey: form.googleApiKey,
        name: form.name,
        email: form.email,
        password: form.password
      });
      setAuth(result.token, result.user);
      await restartLiveKit().catch(() => undefined);
      await restartLuna().catch(() => undefined);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : typeof err === "string" ? err : "Onboarding failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GalaxyShell>
      <AnimatePresence mode="wait">
        {step === "landing" && (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            className="relative z-10 flex w-full max-w-3xl flex-col items-center px-6 text-center"
          >
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/10 text-cyan-100 shadow-[0_0_34px_rgba(34,211,238,0.35)] backdrop-blur">
              <Sparkles size={24} />
            </div>
            <h1 className="text-6xl font-extrabold tracking-normal text-white sm:text-7xl">Quasar</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-zinc-300">
              A local command center for Luna, your workspace, and the stars between them.
            </p>
            <Button
              className="mt-9 h-12 rounded-lg bg-cyan-400 px-7 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
              onClick={() => setStep("voice")}
            >
              lets reach the stars!
            </Button>
          </motion.div>
        )}

        {step !== "landing" && (
          <motion.form
            key={step}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            onSubmit={complete}
            className="relative z-10 w-full max-w-lg rounded-xl border border-white/10 bg-zinc-950/72 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Luna onboarding</p>
            {step === "voice" && (
              <OnboardingPanel title="Choose Luna's voice">
                <select
                  className="h-11 w-full rounded-md border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-300"
                  value={form.voice}
                  onChange={(e) => setForm((f) => ({ ...f, voice: e.target.value }))}
                >
                  {lunaVoices.map((voice) => (
                    <option key={voice} value={voice}>{voice}</option>
                  ))}
                </select>
                <StepActions onBack={() => setStep("landing")} onNext={() => setStep("persona")} />
              </OnboardingPanel>
            )}

            {step === "persona" && (
              <OnboardingPanel title="Shape Luna's personality">
                <textarea
                  className="min-h-40 w-full resize-none rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none focus:border-cyan-300"
                  value={form.persona}
                  onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
                />
                <StepActions
                  onBack={() => setStep("voice")}
                  onNext={() => {
                    if (!form.persona.trim()) {
                      toast.error("Luna personality is required.");
                      return;
                    }
                    setStep("api");
                  }}
                />
              </OnboardingPanel>
            )}

            {step === "api" && (
              <OnboardingPanel title="Connect Google realtime">
                <Input
                  type="password"
                  placeholder="Google API key"
                  value={form.googleApiKey}
                  onChange={(e) => setForm((f) => ({ ...f, googleApiKey: e.target.value }))}
                />
                <StepActions
                  onBack={() => setStep("persona")}
                  onNext={() => {
                    if (!form.googleApiKey.trim()) {
                      toast.error("Google API key is required.");
                      return;
                    }
                    setStep("account");
                  }}
                />
              </OnboardingPanel>
            )}

            {step === "account" && (
              <OnboardingPanel title="Create your local profile">
                <div className="space-y-3">
                  <Input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                  <Input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                  <Input type="password" placeholder="Confirm password" value={form.confirmPassword} onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))} />
                  {accountError && <p className="text-sm text-red-300">{accountError}</p>}
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Button type="button" variant="outline" onClick={() => setStep("api")}>Back</Button>
                  <Button type="submit" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300" disabled={loading || !!accountError}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finish"}
                  </Button>
                </div>
              </OnboardingPanel>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </GalaxyShell>
  );
}

function GalaxyShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-[#040713]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_20%_70%,rgba(244,63,94,0.12),transparent_26%),radial-gradient(circle_at_82%_62%,rgba(250,204,21,0.10),transparent_22%)]" />
      <motion.div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.95) 0 1px, transparent 1.5px), radial-gradient(circle, rgba(125,211,252,0.8) 0 1px, transparent 1.5px)",
          backgroundSize: "72px 72px, 113px 113px",
          backgroundPosition: "0 0, 30px 40px"
        }}
        animate={{ backgroundPosition: ["0px 0px, 30px 40px", "72px 72px, 143px 153px"] }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute h-[42rem] w-[42rem] rounded-full border border-cyan-200/10"
        animate={{ rotate: 360 }}
        transition={{ duration: 46, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute h-[28rem] w-[28rem] rounded-full border border-rose-200/10"
        animate={{ rotate: -360 }}
        transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
      />
      {children}
    </div>
  );
}

function OnboardingPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h2 className="mt-3 text-2xl font-semibold text-white">{title}</h2>
      <div className="mt-6">{children}</div>
    </>
  );
}

function StepActions({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3">
      <Button type="button" variant="outline" onClick={onBack}>Back</Button>
      <Button type="button" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300" onClick={onNext}>Next</Button>
    </div>
  );
}
