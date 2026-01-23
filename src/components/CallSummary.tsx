import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface CallSummaryProps {
  callId: Id<"calls">;
  onBack: () => void;
}

export function CallSummary({ callId, onBack }: CallSummaryProps) {
  const call = useQuery(api.calls.getCall, { callId });
  const transcripts = useQuery(api.transcripts.getTranscripts, { callId });

  if (!call) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
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

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back to History</span>
        </button>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{call.title}</h1>
        <div className="flex items-center space-x-6 text-gray-600">
          <span>{formatDate(call.startedAt)}</span>
          <span>{formatDuration(call.duration)}</span>
          <span>{call.primaryLanguage} ↔ {call.secondaryLanguage}</span>
        </div>
      </div>

      {/* Summary Section */}
      {call.summary && (
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Call Summary</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Overview</h3>
              <p className="text-gray-700 leading-relaxed">{call.summary}</p>
            </div>

            {call.keyPoints && call.keyPoints.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Key Points</h3>
                <ul className="space-y-2">
                  {call.keyPoints.map((point, index) => (
                    <li key={index} className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                      <span className="text-gray-700">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Transcript */}
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Full Transcript</h2>
        
        {!transcripts || transcripts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>No transcript available for this call</p>
          </div>
        ) : (
          <div className="space-y-6">
            {transcripts.map((transcript, index) => (
              <div
                key={transcript._id}
                className={`p-6 rounded-xl ${
                  transcript.speaker === "user"
                    ? "bg-blue-50 border-l-4 border-blue-500"
                    : "bg-gray-50 border-l-4 border-gray-500"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <span className="font-semibold text-gray-900">
                      {transcript.speaker === "user" ? "You" : "Other Person"}
                    </span>
                    <span className="text-sm text-gray-500">
                      ({transcript.originalLanguage})
                    </span>
                  </div>
                  <span className="text-sm text-gray-400">
                    {new Date(transcript.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-gray-900 font-medium">Original:</p>
                    <p className="text-gray-800 mt-1">{transcript.originalText}</p>
                  </div>
                  
                  <div className="border-t pt-3">
                    <p className="text-gray-700 font-medium">Translation ({transcript.translatedLanguage}):</p>
                    <p className="text-gray-700 mt-1 italic">{transcript.translatedText}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
