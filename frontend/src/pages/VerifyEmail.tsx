import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../api";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This verification link is missing its token.");
      return;
    }
    void verifyEmail(token)
      .then((result) => {
        setState("success");
        setMessage(result);
      })
      .catch((error: unknown) => {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Verification failed");
      });
  }, [token]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="game-panel p-8 text-center sm:p-10">
        <div className="text-6xl">{state === "success" ? "✅" : state === "error" ? "⚠️" : "📬"}</div>
        <p className="metric-label mt-5">Email verification</p>
        <h1 className="mt-2 text-3xl font-black text-white">
          {state === "success" ? "You’re verified!" : state === "error" ? "That link didn’t work" : "Checking your link…"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          {state === "success" && <Link className="game-button bg-[#ffba08] px-5 py-3 font-black text-[#370617]" to="/login">Sign in + build a deck →</Link>}
          {state === "error" && <Link className="game-button border border-white/10 bg-white/[0.04] px-5 py-3 font-black text-white" to="/signup">Back to sign up</Link>}
        </div>
      </div>
    </div>
  );
}
