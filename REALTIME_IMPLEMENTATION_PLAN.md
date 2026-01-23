# Realtime Voice Translation App Plan

This document captures the execution plan to make the live voice translation app functional with the OpenAI Realtime API over WebRTC. The approach uses a raw WebRTC integration (no Agents SDK) for determinism and control, and stores both input and output transcript sides.

## Scope And Decisions

- Connection method: WebRTC (raw, no Agents SDK)
- Model: gpt-realtime
- Session type: realtime (speech-to-speech)
- Transcript storage: both user input and model output
- Interpreter behavior: model translates between the selected languages after anyone speaks, with no commentary

## Plan (Impact: Large)

### 1) Realtime session bootstrap (Convex backend)

- Add a Convex action (or HTTP route) that creates a client secret via `POST /v1/realtime/client_secrets`.
- Keep `OPENAI_API_KEY` server-side only.
- Session config to include:
  - `type: "realtime"`
  - `model: "gpt-realtime"`
  - `instructions`: interpreter prompt using selected languages
  - `audio.output.voice`: default (e.g. `marin`)
  - `input_audio_transcription` if supported in GA for WebRTC (needed for input transcripts)
- Return the ephemeral key and any session defaults needed by the client.

### 2) WebRTC client connection (frontend)

- Replace `MediaRecorder` mock flow in `src/components/CallInterface.tsx`.
- Establish WebRTC connection:
  - `getUserMedia({ audio: true })`
  - Create `RTCPeerConnection`, add mic track
  - Create SDP offer and POST to `https://api.openai.com/v1/realtime/calls` with the ephemeral key
  - Set remote description from the SDP answer
  - Open a data channel if required by the WebRTC guide; attach event handlers

### 3) Session configuration and realtime events

- Send `session.update` over the data channel after connect:
  - `session.type = "realtime"`
  - `session.model = "gpt-realtime"`
  - `session.instructions = interpreter prompt`
  - `session.audio.output.voice = <voice>`
- Listen for GA event names:
  - `response.output_audio.delta`
  - `response.output_text.delta`
  - `response.output_audio_transcript.delta`
  - `conversation.item.added` and `conversation.item.done` for stable transcript chunks

### 4) Audio playback

- If WebRTC provides a remote audio track, pipe it to the audio output element.
- If output is delivered as audio deltas, buffer/decode and play per the WebRTC guide.
- Update UI controls:
  - Remove speaker toggle and recording start/stop
  - Show connection state, mute toggle, and end call

### 5) Transcript capture (store both sides)

- Input side: use input transcription events to store user speech text.
- Output side: store model output text as translated speech.
- Persist via `api.transcripts.addTranscript` with:
  - `speaker: "user"` for input text and `"other"` for output translation
  - `originalLanguage` and `translatedLanguage` inferred from the interpreter prompt
  - timestamps from event metadata when available

### 6) Summary + action items

- Extend schema to include `actionItems` (or split key info vs action items).
- Update `convex/ai.ts` summary prompt to return:
  - title
  - concise summary
  - key information
  - action items
- Update `CallSummary` UI to render the new sections.

### 7) Search across transcripts + summaries

- Add searchable call text (e.g. `summaryText` for title + summary + key info).
- Update search to merge results from:
  - calls by title/summary
  - transcripts by full-text match
- Update `CallHistory` to use unified search results.

### 8) Filters + user settings

- Add secondary language and date-to filters in the UI and pass through to queries.
- Pre-fill languages from `userSettings` and persist them on call start.

### 9) QA and UX hardening

- Handle mic permission errors and session disconnects gracefully.
- End call should close WebRTC cleanly, then trigger summary generation.
- Add lightweight dev logging for realtime events.

## Interpreter Prompt (Draft)

You are a live interpreter between <primary> and <secondary>.
After anyone speaks, respond only with the translation in the other language.
Do not add commentary, summaries, or explanations.

## Verification Checklist

- Start call, speak in either language, and hear immediate translated audio output.
- Live transcript updates for both input and output.
- End call produces a summary with key info and action items.
- History filters (primary, secondary, date range) work.
- Search finds matches in transcript bodies and summaries.
