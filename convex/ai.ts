import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

type SummaryResult = {
  title: string;
  summary: string;
  keyPoints: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isUnknownArray = (value: unknown): value is unknown[] =>
  Array.isArray(value);

const parseChatCompletionContent = (data: unknown): string => {
  if (!isRecord(data)) {
    throw new Error("Invalid OpenAI response");
  }

  const choices = isUnknownArray(data.choices) ? data.choices : [];
  if (choices.length === 0) {
    throw new Error("OpenAI response missing choices");
  }

  const first = choices[0];
  if (!isRecord(first)) {
    throw new Error("OpenAI response choice is invalid");
  }

  const message = first.message;
  if (!isRecord(message)) {
    return "";
  }

  const content = message.content;
  return typeof content === "string" ? content : "";
};

const parseSummaryResult = (content: string): SummaryResult => {
  const sanitizedContent = content
    .replace(/```json\s*/g, "")
    .replace(/```/g, "")
    .trim();
  const jsonMatch = sanitizedContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in summary response");
  }

  const parsed: unknown = JSON.parse(jsonMatch[0]);
  if (!isRecord(parsed)) {
    throw new Error("Summary response JSON was not an object");
  }

  const title = parsed.title;
  const summary = parsed.summary;
  const keyPoints = parsed.keyPoints;

  if (typeof title !== "string" || typeof summary !== "string") {
    throw new Error("Summary response missing title or summary");
  }

  const normalizedKeyPoints = Array.isArray(keyPoints)
    ? keyPoints.filter((point): point is string => typeof point === "string")
    : [];

  return {
    title,
    summary,
    keyPoints: normalizedKeyPoints,
  };
};

export const generateCallSummary = action({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const transcripts = await ctx.runQuery(
      internal.transcripts.getTranscriptsForSummary,
      {
        callId: args.callId,
      },
    );

    if (transcripts.length === 0) {
      return null;
    }

    const conversationText = transcripts
      .map((transcript) => transcript.originalText)
      .join("\n");

    const prompt = `
Analyze this translated conversation and provide:
1. A concise title (max 50 characters)
2. A brief summary (2-3 sentences)
3. Key information (bullet points)

Conversation:
${conversationText}

Respond in JSON format:
{
  "title": "...",
  "summary": "...",
  "keyPoints": ["...", "..."]
}`;

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
          }),
        },
      );

      const data: unknown = await response.json();
      const rawContent = parseChatCompletionContent(data);
      const result = parseSummaryResult(rawContent);

      await ctx.runMutation(internal.calls.updateCallSummary, {
        callId: args.callId,
        title: result.title,
        summary: result.summary,
        keyPoints: Array.isArray(result.keyPoints) ? result.keyPoints : [],
      });

      return result;
    } catch (error) {
      console.error("Failed to generate summary:", error);
      return null;
    }
  },
});

export const translateText = action({
  args: {
    text: v.string(),
    fromLanguage: v.string(),
    toLanguage: v.string(),
  },
  handler: async (ctx, args) => {
    const prompt = `Translate the following text from ${args.fromLanguage} to ${args.toLanguage}. Only return the translation, no explanations:

${args.text}`;

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
          }),
        },
      );

      const data: unknown = await response.json();
      const content = parseChatCompletionContent(data);
      return content.trim();
    } catch (error) {
      console.error("Translation failed:", error);
      return args.text; // Return original text if translation fails
    }
  },
});
