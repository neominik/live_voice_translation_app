import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

type RealtimeMessage = Record<string, unknown> & {
  type: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseRealtimeMessage = (data: string): RealtimeMessage | null => {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!isRecord(parsed)) {
      return null;
    }
    if (typeof parsed.type !== "string") {
      return null;
    }
    return parsed as RealtimeMessage;
  } catch (error) {
    console.error("Failed to parse realtime payload", error);
    return null;
  }
};

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
  const [needsAudioResume, setNeedsAudioResume] = useState(false);
  const [transcripts, setTranscripts] = useState<
    Array<{
      originalText: string;
      timestamp: number;
    }>
  >([]);
  const [partialTranscript, setPartialTranscript] = useState<{
    text: string;
    timestamp: number;
  } | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

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

  useEffect(() => {
    if (!transcriptScrollRef.current) {
      return;
    }
    if (shouldAutoScrollRef.current) {
      transcriptScrollRef.current.scrollTop =
        transcriptScrollRef.current.scrollHeight;
    }
  }, [transcripts, partialTranscript]);

  const handleTranscriptScroll = () => {
    const container = transcriptScrollRef.current;
    if (!container) {
      return;
    }
    const scrollOffset =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = scrollOffset < 16;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const waitForIceGatheringComplete = useCallback(
    (peerConnection: RTCPeerConnection) => {
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

        peerConnection.addEventListener(
          "icegatheringstatechange",
          onStateChange,
        );
      });
    },
    [],
  );

  const stopRealtimeSession = useCallback(() => {
    isEndingCallRef.current = true;
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
    isEndingCallRef.current = false;
    setNeedsAudioResume(false);
    hasStartedTimerRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startRealtimeSession = useCallback(async () => {
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
        if (typeof event.data !== "string") {
          return;
        }
        const payload = parseRealtimeMessage(event.data);
        if (!payload) {
          return;
        }

        if (import.meta.env.DEV) {
          console.debug("Realtime event", payload.type, payload);
        }

        if (
          payload.type === "response.output_text.delta" ||
          payload.type === "input_audio_transcript.delta"
        ) {
          const deltaText =
            typeof payload.delta === "string" ? payload.delta : "";
          if (!deltaText) {
            return;
          }
          setPartialTranscript((prev) => {
            if (!prev) {
              return {
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
          const deltaText =
            typeof payload.delta === "string" ? payload.delta : "";
          if (!deltaText) {
            return;
          }
          const response = isRecord(payload.response) ? payload.response : null;
          const responseId =
            (typeof payload.response_id === "string" &&
              payload.response_id) ||
            (typeof response?.id === "string" ? response.id : null);
          if (
            responseId &&
            responseId !== outputTranscriptResponseIdRef.current
          ) {
            outputTranscriptResponseIdRef.current = responseId;
            outputTranscriptRef.current = "";
          }
          outputTranscriptRef.current = `${outputTranscriptRef.current}${deltaText}`;
          setPartialTranscript({
            text: outputTranscriptRef.current,
            timestamp: Date.now(),
          });
          return;
        }

        if (payload.type === "response.output_audio_transcript.done") {
          const response = isRecord(payload.response) ? payload.response : null;
          const responseId =
            (typeof payload.response_id === "string" &&
              payload.response_id) ||
            (typeof response?.id === "string" ? response.id : null);
          if (
            responseId &&
            responseId !== outputTranscriptResponseIdRef.current
          ) {
            outputTranscriptResponseIdRef.current = responseId;
          }
          const transcriptText =
            typeof payload.transcript === "string" ? payload.transcript : null;
          const textValue =
            typeof payload.text === "string" ? payload.text : null;
          const finalText =
            transcriptText ?? textValue ?? outputTranscriptRef.current;
          outputTranscriptRef.current = "";
          outputTranscriptResponseIdRef.current = null;

          if (!finalText) {
            return;
          }

          setPartialTranscript(null);

          const timestamp = Date.now();

          setTranscripts((prev) => [
            ...prev,
            {
              originalText: finalText,
              timestamp,
            },
          ]);

          void addTranscript({
            callId,
            originalText: finalText,
            timestamp,
          });
          return;
        }

        if (payload.type === "response.output_audio.delta") {
          return;
        }

        const item = isRecord(payload.item) ? payload.item : null;
        if (!item) {
          return;
        }

        const contentParts = Array.isArray(item.content) ? item.content : [];
        const text = contentParts
          .map((part) => {
            if (!isRecord(part)) {
              return null;
            }
            const partText =
              typeof part.text === "string" ? part.text : null;
            const partType =
              typeof part.type === "string" ? part.type : null;
            if (!partText) {
              return null;
            }
            if (
              partType === "input_text" ||
              partType === "output_text" ||
              partType === "output_audio_transcript" ||
              partType === "input_audio_transcript" ||
              partType === "text" ||
              !partType
            ) {
              return partText;
            }
            return null;
          })
          .filter((part): part is string => Boolean(part))
          .join(" ")
          .trim();

        if (payload.type === "conversation.item.added") {
          if (!text) {
            return;
          }
          setPartialTranscript({
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

        const eventTimestamp =
          typeof item.created_at === "number"
            ? item.created_at * 1000
            : Date.now();

        setPartialTranscript(null);

        setTranscripts((prev) => [
          ...prev,
          {
            originalText: text,
            timestamp: eventTimestamp,
          },
        ]);

        void addTranscript({
          callId,
          originalText: text,
          timestamp: eventTimestamp,
        });
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
      stopRealtimeSession();
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
  }, [
    addTranscript,
    callId,
    createRealtimeSession,
    primaryLanguage,
    secondaryLanguage,
    stopRealtimeSession,
    waitForIceGatheringComplete,
  ]);

  useEffect(() => {
    void startRealtimeSession();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      stopRealtimeSession();
    };
  }, [startRealtimeSession, stopRealtimeSession]);

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

  const endCallFlow = useCallback(async () => {
    try {
      stopRealtimeSession();
      await endCall({ callId, duration: callDuration });

      // Generate summary in the background
      void generateSummary({ callId }).catch(console.error);

      onEndCall();
      toast.success("Call ended successfully");
    } catch (error) {
      toast.error("Failed to end call");
      console.error(error);
    }
  }, [callDuration, callId, endCall, generateSummary, onEndCall, stopRealtimeSession]);

  const handleEndCall = () => {
    void endCallFlow();
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
            <div
              ref={transcriptScrollRef}
              className="flex-1 overflow-y-auto divide-y divide-gray-100"
              onScroll={handleTranscriptScroll}
            >
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
                          originalText: partialTranscript.text,
                          timestamp: partialTranscript.timestamp,
                          isPartial: true,
                        },
                      ]
                    : []),
                ].map((transcript, index) => (
                  <div key={index} className="py-3">
                    <p className="text-gray-900 text-sm leading-relaxed">
                      {transcript.originalText}
                      {"isPartial" in transcript ? "…" : ""}
                    </p>
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
