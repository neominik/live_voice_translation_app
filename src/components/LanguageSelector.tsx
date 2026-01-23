import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Russian",
  "Chinese",
  "Japanese",
  "Korean",
  "Arabic",
  "Hindi",
  "Dutch",
  "Swedish",
  "Norwegian",
  "Danish",
  "Finnish",
  "Polish",
];

const DEFAULT_VOICE_SETTINGS = {
  inputGain: 0.8,
  outputVolume: 0.8,
  autoTranslate: true,
};

interface LanguageSelectorProps {
  selectedLanguages: { primary: string; secondary: string };
  onLanguagesChange: (languages: {
    primary: string;
    secondary: string;
  }) => void;
  onStartCall: (callId: Id<"calls">) => void;
  onViewHistory: () => void;
}

export function LanguageSelector({
  selectedLanguages,
  onLanguagesChange,
  onStartCall,
  onViewHistory,
}: LanguageSelectorProps) {
  const [isStarting, setIsStarting] = useState(false);
  const startCall = useMutation(api.calls.startCall);
  const updateUserSettings = useMutation(api.userSettings.updateUserSettings);
  const userSettings = useQuery(api.userSettings.getUserSettings);

  const handleLanguageChange = (
    type: "primary" | "secondary",
    language: string,
  ) => {
    onLanguagesChange({
      ...selectedLanguages,
      [type]: language,
    });
  };

  const handleStartCall = async () => {
    if (selectedLanguages.primary === selectedLanguages.secondary) {
      toast.error("Please select different languages for translation");
      return;
    }

    setIsStarting(true);
    try {
      const callId = await startCall({
        primaryLanguage: selectedLanguages.primary,
        secondaryLanguage: selectedLanguages.secondary,
      });

      const voiceSettings =
        userSettings?.voiceSettings ?? DEFAULT_VOICE_SETTINGS;
      updateUserSettings({
        preferredPrimaryLanguage: selectedLanguages.primary,
        preferredSecondaryLanguage: selectedLanguages.secondary,
        voiceSettings,
      }).catch((error) => {
        console.error("Failed to persist user settings", error);
      });

      onStartCall(callId);
      toast.success("Call started successfully");
    } catch (error) {
      toast.error("Failed to start call");
      console.error(error);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          {/* Primary Language */}
          <div className="space-y-4">
            <label className="block text-lg font-semibold text-gray-700">
              Your Language
            </label>
            <select
              value={selectedLanguages.primary}
              onChange={(e) => handleLanguageChange("primary", e.target.value)}
              className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-lg"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          {/* Secondary Language */}
          <div className="space-y-4 md:col-start-2 md:row-start-1">
            <label className="block text-lg font-semibold text-gray-700">
              Other Person's Language
            </label>
            <select
              value={selectedLanguages.secondary}
              onChange={(e) =>
                handleLanguageChange("secondary", e.target.value)
              }
              className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-lg"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <button
            onClick={handleStartCall}
            disabled={
              isStarting ||
              selectedLanguages.primary === selectedLanguages.secondary
            }
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
          >
            {isStarting ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Starting Call...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                <span>Start Live Translation</span>
              </div>
            )}
          </button>

          <button
            onClick={onViewHistory}
            className="flex-1 sm:flex-initial bg-gray-100 text-gray-700 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-200 transition-colors"
          >
            <div className="flex items-center justify-center space-x-2">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Conversation History</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
