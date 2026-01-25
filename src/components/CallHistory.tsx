import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

interface CallHistoryProps {
  onViewCall: (callId: Id<"calls">) => void;
  onBack: () => void;
}

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

export function CallHistory({ onViewCall, onBack }: CallHistoryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [secondaryLanguageFilter, setSecondaryLanguageFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");

  const callsQuery = useQuery(api.calls.listCalls, {
    paginationOpts: { numItems: 20, cursor: null },
    primaryLanguage: languageFilter || undefined,
    secondaryLanguage: secondaryLanguageFilter || undefined,
    dateFrom: dateFilter ? new Date(dateFilter).getTime() : undefined,
    dateTo: dateToFilter ? new Date(dateToFilter).getTime() : undefined,
  });

  const availableCallsQuery = useQuery(api.calls.listCalls, {
    paginationOpts: { numItems: 1000, cursor: null },
  });

  const deleteCall = useMutation(api.calls.deleteCall);

  const searchResults = useQuery(
    api.calls.searchCalls,
    searchTerm
      ? {
          searchTerm,
          paginationOpts: { numItems: 20, cursor: null },
          primaryLanguage: languageFilter || undefined,
          secondaryLanguage: secondaryLanguageFilter || undefined,
          dateFrom: dateFilter ? new Date(dateFilter).getTime() : undefined,
          dateTo: dateToFilter ? new Date(dateToFilter).getTime() : undefined,
        }
      : "skip",
  );

  const calls = searchTerm ? searchResults?.page : callsQuery?.page;

  const availableLanguages = useMemo(() => {
    const usedLanguages = new Set<string>();
    for (const call of availableCallsQuery?.page ?? []) {
      usedLanguages.add(call.primaryLanguage);
      usedLanguages.add(call.secondaryLanguage);
    }

    const knownLanguages = LANGUAGES.filter((language) =>
      usedLanguages.has(language),
    );
    const customLanguages = Array.from(usedLanguages).filter(
      (language) => !LANGUAGES.includes(language),
    );

    return [...knownLanguages, ...customLanguages.sort()];
  }, [availableCallsQuery?.page]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleDeleteCall = async (
    event: MouseEvent<HTMLButtonElement>,
    callId: Id<"calls">,
  ) => {
    event.stopPropagation();
    const confirmed = window.confirm(
      "Delete this call and its transcript? This cannot be undone.",
    );
    if (!confirmed) {
      return;
    }
    try {
      await deleteCall({ callId });
      toast.success("Call deleted");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete call");
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-slate-400 hover:text-slate-200 mb-4"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span>Back to Home</span>
          </button>
          <h1 className="text-3xl font-bold">Call History</h1>
          <p className="text-slate-400">
            View and search your past translation calls
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="panel p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm field-label mb-2">
              Search Calls
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title or content..."
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm field-label mb-2">
              Primary Language
            </label>
            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="select-field"
            >
              <option value="">All Languages</option>
              {availableLanguages.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm field-label mb-2">
              Secondary Language
            </label>
            <select
              value={secondaryLanguageFilter}
              onChange={(e) => setSecondaryLanguageFilter(e.target.value)}
              className="select-field"
            >
              <option value="">All Languages</option>
              {availableLanguages.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm field-label mb-2">Date From</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm field-label mb-2">Date To</label>
            <input
              type="date"
              value={dateToFilter}
              onChange={(e) => setDateToFilter(e.target.value)}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Call List */}
      <div className="space-y-4">
        {calls === undefined ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-300"></div>
          </div>
        ) : calls.length === 0 ? (
          <div className="panel panel-strong p-12 text-center">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-slate-500"
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
            <h3 className="text-xl font-semibold mb-2">No calls found</h3>
            <p className="text-slate-400">
              Start your first translation call to see it here
            </p>
          </div>
        ) : (
          calls.map((call) => (
            <div
              key={call._id}
              className="panel-muted p-6 cursor-pointer transition-transform hover:-translate-y-0.5"
              onClick={() => onViewCall(call._id)}
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0">
                    <h3 className="text-lg font-semibold truncate">
                      {call.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => handleDeleteCall(event, call._id)}
                      className="button-danger h-9 w-9 p-0 rounded-full flex items-center justify-center"
                      aria-label="Delete call"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3m-4 0h14"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
                  <span className="flex items-center space-x-1">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                      />
                    </svg>
                    <span>
                      {call.primaryLanguage} ↔ {call.secondaryLanguage}
                    </span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <svg
                      className="w-4 h-4"
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
                    <span>{formatDuration(call.duration)}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 0h6m-6 0l-2 2m8-2l2 2m-2-2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V9"
                      />
                    </svg>
                    <span>{formatDate(call.startedAt)}</span>
                  </span>
                </div>
                {call.summary && (
                  <p className="text-slate-200 line-clamp-2">
                    {call.summary}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
