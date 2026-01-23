import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { CallInterface } from "./CallInterface";
import { CallHistory } from "./CallHistory";
import { LanguageSelector } from "./LanguageSelector";
import { CallSummary } from "./CallSummary";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";

type View = "home" | "call" | "history" | "summary";

export function VoiceTranslationApp() {
  const [currentView, setCurrentView] = useState<View>("home");
  const [activeCallId, setActiveCallId] = useState<Id<"calls"> | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<Id<"calls"> | null>(
    null,
  );
  const [selectedLanguages, setSelectedLanguages] = useState({
    primary: "English",
    secondary: "Spanish",
  });
  const [hasInitializedSettings, setHasInitializedSettings] = useState(false);
  const userSettings = useQuery(api.userSettings.getUserSettings);

  useEffect(() => {
    if (!userSettings || hasInitializedSettings) {
      return;
    }

    setSelectedLanguages({
      primary: userSettings.preferredPrimaryLanguage,
      secondary: userSettings.preferredSecondaryLanguage,
    });
    setHasInitializedSettings(true);
  }, [userSettings, hasInitializedSettings]);

  useEffect(() => {
    const handleGoHome = () => {
      if (currentView === "call") {
        return;
      }
      setSelectedCallId(null);
      setCurrentView("home");
    };

    window.addEventListener("live-translation:home", handleGoHome);
    return () => {
      window.removeEventListener("live-translation:home", handleGoHome);
    };
  }, [currentView]);

  const handleStartCall = (callId: Id<"calls">) => {
    setActiveCallId(callId);
    setCurrentView("call");
  };

  const handleEndCall = () => {
    setCurrentView("summary");
    setSelectedCallId(activeCallId);
    setActiveCallId(null);
  };

  const handleViewCall = (callId: Id<"calls">) => {
    setSelectedCallId(callId);
    setCurrentView("summary");
  };

  const renderView = () => {
    switch (currentView) {
      case "call":
        return activeCallId ? (
          <CallInterface
            callId={activeCallId}
            primaryLanguage={selectedLanguages.primary}
            secondaryLanguage={selectedLanguages.secondary}
            onEndCall={handleEndCall}
          />
        ) : null;

      case "history":
        return (
          <CallHistory
            onViewCall={handleViewCall}
            onBack={() => setCurrentView("home")}
          />
        );

      case "summary":
        return selectedCallId ? (
          <CallSummary
            callId={selectedCallId}
            onBack={() => setCurrentView("history")}
          />
        ) : null;

      default:
        return (
          <LanguageSelector
            selectedLanguages={selectedLanguages}
            onLanguagesChange={setSelectedLanguages}
            onStartCall={handleStartCall}
            onViewHistory={() => setCurrentView("history")}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {renderView()}
    </div>
  );
}
