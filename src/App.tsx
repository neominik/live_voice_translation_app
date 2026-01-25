import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { VoiceTranslationApp } from "./components/VoiceTranslationApp";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col app-shell">
      <header className="sticky top-0 z-10 h-16 flex justify-between items-center px-4 app-header">
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("live-translation:home"));
          }}
          className="text-xl font-semibold brand"
        >
          Live<span className="brand-accent">Translation</span>
        </button>
        <Authenticated>
          <SignOutButton />
        </Authenticated>
      </header>
      <main className="flex-1">
        <Content />
      </main>
      <Toaster />
    </div>
  );
}

function Content() {
  const loggedInUser = useQuery(api.auth.loggedInUser);

  if (loggedInUser === undefined) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Authenticated>
        <VoiceTranslationApp />
      </Authenticated>

      <Unauthenticated>
        <div className="flex items-center justify-center min-h-[600px] p-8">
          <div className="w-full max-w-md mx-auto">
            <div className="text-center mb-8 hero-card p-8">
              <h1 className="text-4xl font-bold mb-4">
                Live<span className="brand-accent">Translation</span>
              </h1>
              <p className="text-lg text-slate-200 mb-2">
                Real-time Voice Translation
              </p>
              <p className="text-sm text-slate-400">
                Break language barriers with AI-powered live interpretation
              </p>
            </div>
            <SignInForm />
          </div>
        </div>
      </Unauthenticated>
    </div>
  );
}
