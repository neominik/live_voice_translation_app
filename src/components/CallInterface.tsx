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
  const [callDuration, setCallDuration] = useState(0);
  const [connectionState, setConnectionState] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [needsAudioResume, setNeedsAudioResume] = useState(false);
  const [transcripts, setTranscripts] = useState<
    Array<{
      speaker: "user" | "other";
      originalText: string;
      translatedText: string;
      timestamp: number;
    }>
  >([]);
  const [partialTranscript, setPartialTranscript] = useState<{
    speaker: "user" | "other";
    text: string;
    timestamp: number;
  } | null>(null);

  const endCall = useMutation(api.calls.endCall);
  const generateSummary = useAction(api.ai.generateCallSummary);
  const createRealtimeSession = useAction(api.realtime.createRealtimeSession);
  const addTranscript = useMutation(api.transcripts.addTranscript);

  const promptRef = useRef(
    `# Role & Objective
You are a live interpreter between ${primaryLanguage} and ${secondaryLanguage}.
Your job is to translate EVERYTHING the speaker says in the current turn.

# Instructions / Rules
- Translate the FULL utterance, not just the last sentence or clause.
- Preserve the original order of sentences and meaning.
- Do not summarize, omit, or compress. Translate all sentences.
- Output only the translation, no commentary.
- If you are interrupted mid-translation, resume and restate the unfinished part before translating the new input.

# Output Formatting
- If the speaker uses multiple sentences, output multiple sentences in the translation.
- Keep sentence boundaries clear (use punctuation, not line breaks).

# Examples (use as pattern, do not copy verbatim)
Input (${primaryLanguage}): “Ich komme heute später. Der Zug ist verspätet.”
Output (${secondaryLanguage}): “I’ll be late today. The train is delayed.”

Input (${secondaryLanguage}): “We should meet at five. Also, bring the documents.”
Output (${primaryLanguage}): “Wir sollten uns um fünf treffen. Bring außerdem die Dokumente mit.”`,
  );

  const startTimeRef = useRef(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const isEndingCallRef = useRef(false);
  const outputTranscriptRef = useRef("");
  const outputTranscriptResponseIdRef = useRef<string | null>(null);
  const hasStartedTimerRef = useRef(false);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    startRealtimeSession().catch(console.error);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      void stopRealtimeSession();
    };
  }, []);

  useEffect(() => {
    if (connectionState !== "connected") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (!hasStartedTimerRef.current) {
      hasStartedTimerRef.current = true;
      startTimeRef.current = Date.now();
      setCallDuration(0);
    }

    intervalRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    if (remoteAudioRef.current && remoteStreamRef.current) {
      if (remoteAudioRef.current.srcObject !== remoteStreamRef.current) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
      }
      void remoteAudioRef.current.play().catch(() => {
        setNeedsAudioResume(true);
      });
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [connectionState]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const waitForIceGatheringComplete = (peerConnection: RTCPeerConnection) => {
    if (peerConnection.iceGatheringState === "complete") {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        peerConnection.removeEventListener(
          "icegatheringstatechange",
          onStateChange,
        );
        resolve();
      }, 5000);

      const onStateChange = () => {
        if (peerConnection.iceGatheringState === "complete") {
          window.clearTimeout(timeoutId);
          peerConnection.removeEventListener(
            "icegatheringstatechange",
            onStateChange,
          );
          resolve();
        }
      };

      peerConnection.addEventListener("icegatheringstatechange", onStateChange);
    });
  };

  const startRealtimeSession = async () => {
    try {
      setConnectionState("connecting");
      const session = await createRealtimeSession({
        primaryLanguage,
        secondaryLanguage,
      });

      if (!session.clientSecret) {
        throw new Error("Missing client secret");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteAudioRef.current && remoteStream) {
          remoteAudioRef.current.srcObject = remoteStream;
          void remoteAudioRef.current.play().catch(() => {
            setNeedsAudioResume(true);
          });
        }
        if (!remoteStream && event.track) {
          const stream = new MediaStream([event.track]);
          remoteStreamRef.current = stream;
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            void remoteAudioRef.current.play().catch(() => {
              setNeedsAudioResume(true);
            });
          }
        } else if (remoteStream) {
          remoteStreamRef.current = remoteStream;
        }

        if (event.track) {
          event.track.onunmute = () => {
            if (remoteAudioRef.current) {
              remoteAudioRef.current.muted = false;
              void remoteAudioRef.current.play().catch(() => {
                setNeedsAudioResume(true);
              });
            }
          };
        }
      };

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "connected") {
          setConnectionState("connected");
        } else if (
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "disconnected"
        ) {
          setConnectionState("error");
          toast.error("Realtime connection lost");
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === "failed") {
          setConnectionState("error");
          toast.error("Realtime connection failed");
        }
      };

      peerConnection.onicecandidateerror = (event) => {
        console.error("ICE candidate error", event);
      };

      const dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      dataChannel.onopen = () => {
        dataChannel.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              model: "gpt-realtime",
              instructions: promptRef.current,
              audio: {
                output: {
                  voice: session.session?.audio?.output?.voice ?? "marin",
                },
              },
            },
          }),
        );
      };

      dataChannel.onclose = () => {
        if (!isEndingCallRef.current) {
          setConnectionState("error");
          toast.error("Realtime session closed unexpectedly");
        }
      };

      dataChannel.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (import.meta.env.DEV) {
            console.debug("Realtime event", payload.type, payload);
          }
          if (
            payload.type === "response.output_text.delta" ||
            payload.type === "input_audio_transcript.delta"
          ) {
            const deltaText = payload.delta ?? "";
            if (!deltaText) {
              return;
            }
            const speaker =
              payload.type === "input_audio_transcript.delta"
                ? "user"
                : "other";
            setPartialTranscript((prev) => {
              if (!prev || prev.speaker !== speaker) {
                return {
                  speaker,
                  text: deltaText,
                  timestamp: Date.now(),
                };
              }
              return {
                ...prev,
                text: `${prev.text}${deltaText}`,
              };
            });
            return;
          }

          if (payload.type === "response.output_audio_transcript.delta") {
            const deltaText = payload.delta ?? "";
            if (!deltaText) {
              return;
            }
            const responseId =
              payload.response_id ?? payload.response?.id ?? null;
            if (
              responseId &&
              responseId !== outputTranscriptResponseIdRef.current
            ) {
              outputTranscriptResponseIdRef.current = responseId;
              outputTranscriptRef.current = "";
            }
            outputTranscriptRef.current = `${outputTranscriptRef.current}${deltaText}`;
            setPartialTranscript({
              speaker: "other",
              text: outputTranscriptRef.current,
              timestamp: Date.now(),
            });
            return;
          }

          if (payload.type === "response.output_audio_transcript.done") {
            const responseId =
              payload.response_id ?? payload.response?.id ?? null;
            if (
              responseId &&
              responseId !== outputTranscriptResponseIdRef.current
            ) {
              outputTranscriptResponseIdRef.current = responseId;
            }
            const finalText =
              payload.transcript ?? payload.text ?? outputTranscriptRef.current;
            outputTranscriptRef.current = "";
            outputTranscriptResponseIdRef.current = null;

            if (!finalText) {
              return;
            }

            setPartialTranscript((prev) =>
              prev && prev.speaker === "other" ? null : prev,
            );

            const timestamp = Date.now();

            setTranscripts((prev) => [
              ...prev,
              {
                speaker: "other",
                originalText: finalText,
                translatedText: "",
                timestamp,
              },
            ]);

            void addTranscript({
              callId,
              speaker: "other",
              originalText: finalText,
              originalLanguage: secondaryLanguage,
              translatedText: "",
              translatedLanguage: primaryLanguage,
              timestamp,
            });
            return;
          }

          if (payload.type === "response.output_audio.delta") {
            return;
          }

          const item = payload.item;
          if (!item) {
            return;
          }

          const contentParts = Array.isArray(item.content) ? item.content : [];
          const text = contentParts
            .map((part: { type?: string; text?: string }) => {
              if (!part?.text) return null;
              if (
                part.type === "input_text" ||
                part.type === "output_text" ||
                part.type === "output_audio_transcript" ||
                part.type === "input_audio_transcript" ||
                part.type === "text"
              ) {
                return part.text;
              }
              return null;
            })
            .filter(Boolean)
            .join(" ")
            .trim();

          if (payload.type === "conversation.item.added") {
            if (!text) {
              return;
            }
            const speaker = item.role === "assistant" ? "other" : "user";
            setPartialTranscript({
              speaker,
              text,
              timestamp: Date.now(),
            });
            return;
          }

          if (payload.type !== "conversation.item.done") {
            return;
          }

          if (!text) {
            return;
          }

          const speaker = item.role === "assistant" ? "other" : "user";
          const originalLanguage =
            speaker === "user" ? primaryLanguage : secondaryLanguage;
          const translatedLanguage =
            speaker === "user" ? secondaryLanguage : primaryLanguage;
          const eventTimestamp =
            typeof item.created_at === "number"
              ? item.created_at * 1000
              : Date.now();

          setPartialTranscript((prev) =>
            prev && prev.speaker === speaker ? null : prev,
          );

          setTranscripts((prev) => [
            ...prev,
            {
              speaker,
              originalText: text,
              translatedText: "",
              timestamp: eventTimestamp,
            },
          ]);

          void addTranscript({
            callId,
            speaker,
            originalText: text,
            originalLanguage,
            translatedText: "",
            translatedLanguage,
            timestamp: eventTimestamp,
          });
        } catch (error) {
          console.error("Failed to parse realtime event", error);
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGatheringComplete(peerConnection);

      const localDescription = peerConnection.localDescription;
      if (!localDescription?.sdp) {
        throw new Error("Missing local SDP after ICE gathering");
      }

      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: localDescription.sdp,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Realtime call failed", {
          status: response.status,
          statusText: response.statusText,
          errorText,
        });
        throw new Error(
          `Realtime call failed: ${response.status} ${errorText}`,
        );
      }

      const answerSdp = await response.text();
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });
    } catch (error) {
      await stopRealtimeSession();
      setConnectionState("error");
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        toast.error(
          "Microphone access denied. Please allow microphone permissions.",
        );
      } else if (
        error instanceof DOMException &&
        error.name === "NotFoundError"
      ) {
        toast.error("No microphone found. Please connect a microphone.");
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to start realtime session",
        );
      }
      console.error(error);
    }
  };

  const stopRealtimeSession = async () => {
    isEndingCallRef.current = true;
    setIsEndingCall(true);
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    setConnectionState("idle");
    setIsMuted(false);
    setIsEndingCall(false);
    isEndingCallRef.current = false;
    setNeedsAudioResume(false);
    hasStartedTimerRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }

    const nextMuted = !isMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const resumeAudioPlayback = () => {
    if (!remoteAudioRef.current) {
      return;
    }

    if (!remoteAudioRef.current.srcObject && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
    }
    remoteAudioRef.current.muted = false;
    remoteAudioRef.current
      .play()
      .then(() => {
        setNeedsAudioResume(false);
      })
      .catch(() => {
        setNeedsAudioResume(true);
      });
  };

  const handleEndCall = async () => {
    try {
      await stopRealtimeSession();
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

  const isConnecting = connectionState !== "connected";
  const isError = connectionState === "error";

  return (
    <div className="max-w-4xl mx-auto p-6 h-screen flex flex-col">
      {isConnecting ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center space-y-6">
            <div className="flex items-center justify-center space-x-3">
              {connectionState === "connecting" ? (
                <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
              ) : (
                <div
                  className={`h-4 w-4 rounded-full ${
                    isError ? "bg-red-500" : "bg-gray-400"
                  }`}
                ></div>
              )}
              <span className="text-sm font-medium text-gray-600 capitalize">
                {connectionState}
              </span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {isError ? "Connection failed" : "Connecting"}
              </h2>
              <p className="text-gray-600 mt-2">
                {isError
                  ? "We couldn't establish the realtime session."
                  : "Setting up your live translation session."}
              </p>
            </div>
            <button
              onClick={handleEndCall}
              className="w-full px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-semibold text-lg transition-colors"
            >
              End Call
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Live Translation
                </h2>
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Live Transcript
            </h3>
            <div className="flex-1 overflow-y-auto space-y-4">
              {transcripts.length === 0 ? (
                <div className="text-center text-gray-500 py-12">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                  <p>Start speaking to see live translations</p>
                </div>
              ) : (
                [
                  ...transcripts,
                  ...(partialTranscript
                    ? [
                        {
                          speaker: partialTranscript.speaker,
                          originalText: partialTranscript.text,
                          translatedText: "",
                          timestamp: partialTranscript.timestamp,
                          isPartial: true,
                        },
                      ]
                    : []),
                ].map((transcript, index) => (
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
                      <p className="text-gray-900">
                        {transcript.originalText}
                        {"isPartial" in transcript ? "…" : ""}
                      </p>
                      {transcript.translatedText ? (
                        <p className="text-gray-600 italic border-t pt-2">
                          → {transcript.translatedText}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-end space-x-4">
              {needsAudioResume ? (
                <button
                  onClick={resumeAudioPlayback}
                  className="px-6 py-4 rounded-xl font-semibold text-lg transition-colors bg-amber-500 hover:bg-amber-600 text-white"
                >
                  Enable Audio
                </button>
              ) : null}
              <button
                onClick={toggleMute}
                className={`px-6 py-4 rounded-xl font-semibold text-lg transition-colors ${
                  isMuted
                    ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }`}
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>

              <button
                onClick={handleEndCall}
                className="px-8 py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-semibold text-lg transition-colors"
              >
                End Call
              </button>
            </div>
          </div>
        </>
      )}
      <audio ref={remoteAudioRef} className="hidden" autoPlay playsInline />
    </div>
  );
}
