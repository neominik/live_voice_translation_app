import { useState, useEffect, useRef } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

interface CallInterfaceProps {
  callId: Id<"calls">;
  primaryLanguage: string;
  secondaryLanguage: string;
  onEndCall: () => void;
}

export function CallInterface({
  callId,
  primaryLanguage,
  secondaryLanguage,
  onEndCall,
}: CallInterfaceProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [currentSpeaker, setCurrentSpeaker] = useState<"user" | "other">("user");
  const [transcripts, setTranscripts] = useState<Array<{
    speaker: "user" | "other";
    originalText: string;
    translatedText: string;
    timestamp: number;
  }>>([]);

  const endCall = useMutation(api.calls.endCall);
  const addTranscript = useMutation(api.transcripts.addTranscript);
  const translateText = useAction(api.ai.translateText);
  const generateSummary = useAction(api.ai.generateCallSummary);

  const startTimeRef = useRef(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    // Start call timer
    intervalRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      toast.error("Failed to access microphone");
      console.error(error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    // In a real implementation, you would:
    // 1. Send audio to OpenAI Realtime API for transcription
    // 2. Get the transcribed text
    // 3. Translate it using the translation API
    // 4. Add to transcripts

    // For demo purposes, we'll simulate this process
    const mockTranscription = "Hello, how are you today?";
    
    try {
      const fromLang = currentSpeaker === "user" ? primaryLanguage : secondaryLanguage;
      const toLang = currentSpeaker === "user" ? secondaryLanguage : primaryLanguage;
      
      const translation = await translateText({
        text: mockTranscription,
        fromLanguage: fromLang,
        toLanguage: toLang,
      });

      const newTranscript = {
        speaker: currentSpeaker,
        originalText: mockTranscription,
        translatedText: translation,
        timestamp: Date.now(),
      };

      setTranscripts(prev => [...prev, newTranscript]);

      await addTranscript({
        callId,
        speaker: currentSpeaker,
        originalText: mockTranscription,
        originalLanguage: fromLang,
        translatedText: translation,
        translatedLanguage: toLang,
      });

      toast.success("Translation added");
    } catch (error) {
      toast.error("Failed to process audio");
      console.error(error);
    }
  };

  const handleEndCall = async () => {
    try {
      await endCall({ callId, duration: callDuration });
      
      // Generate summary in the background
      generateSummary({ callId }).catch(console.error);
      
      onEndCall();
      toast.success("Call ended successfully");
    } catch (error) {
      toast.error("Failed to end call");
      console.error(error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Live Translation</h2>
            <p className="text-gray-600">
              {primaryLanguage} ↔ {secondaryLanguage}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-mono font-bold text-blue-600">
              {formatDuration(callDuration)}
            </div>
            <div className="text-sm text-gray-500">Call Duration</div>
          </div>
        </div>
      </div>

      {/* Transcript Area */}
      <div className="flex-1 bg-white rounded-2xl shadow-xl p-6 mb-6 overflow-hidden flex flex-col">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Live Transcript</h3>
        <div className="flex-1 overflow-y-auto space-y-4">
          {transcripts.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <p>Start speaking to see live translations</p>
            </div>
          ) : (
            transcripts.map((transcript, index) => (
              <div
                key={index}
                className={`p-4 rounded-xl ${
                  transcript.speaker === "user"
                    ? "bg-blue-50 border-l-4 border-blue-500 ml-8"
                    : "bg-gray-50 border-l-4 border-gray-500 mr-8"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm text-gray-600">
                    {transcript.speaker === "user" ? "You" : "Other Person"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(transcript.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="space-y-2">
                  <p className="text-gray-900">{transcript.originalText}</p>
                  <p className="text-gray-600 italic border-t pt-2">
                    → {transcript.translatedText}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between">
          {/* Speaker Toggle */}
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">Speaking:</span>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setCurrentSpeaker("user")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentSpeaker === "user"
                    ? "bg-blue-500 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                You
              </button>
              <button
                onClick={() => setCurrentSpeaker("other")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentSpeaker === "other"
                    ? "bg-blue-500 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Other Person
              </button>
            </div>
          </div>

          {/* Recording Controls */}
          <div className="flex items-center space-x-4">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all ${
                isRecording
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-green-500 hover:bg-green-600 text-white"
              }`}
            >
              {isRecording ? (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                  <span>Stop Recording</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <span>Start Recording</span>
                </div>
              )}
            </button>

            <button
              onClick={handleEndCall}
              className="px-8 py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-semibold text-lg transition-colors"
            >
              End Call
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
