import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const DEFAULT_VOICE = "marin";

const buildInterpreterPrompt = (
  primaryLanguage: string,
  secondaryLanguage: string,
) => {
  return `# Role & Objective
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
Output (${primaryLanguage}): “Wir sollten uns um fünf treffen. Bring außerdem die Dokumente mit.”`;
};

export const createRealtimeSession = action({
  args: {
    primaryLanguage: v.string(),
    secondaryLanguage: v.string(),
    voice: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY");
    }

    const session = {
      type: "realtime",
      model: "gpt-realtime",
      instructions: buildInterpreterPrompt(
        args.primaryLanguage,
        args.secondaryLanguage,
      ),
      audio: {
        output: {
          voice: args.voice ?? DEFAULT_VOICE,
        },
      },
    };

    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create realtime session: ${response.status} ${errorText}`,
      );
    }

    const data = await response.json();
    const clientSecret =
      data.client_secret?.value ?? data.value ?? data.client_secret ?? null;
    const expiresAt =
      data.client_secret?.expires_at ??
      data.expires_at ??
      data.client_secret?.expiresAt ??
      null;

    if (!clientSecret) {
      throw new Error(
        `Missing client secret in response: ${JSON.stringify(data)}`,
      );
    }

    return {
      clientSecret,
      expiresAt,
      session,
    };
  },
});
