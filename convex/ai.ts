import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

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
      .map((t: any) => {
        const translation = t.translatedText
          ? ` | translation (${t.translatedLanguage}): ${t.translatedText}`
          : "";
        return `${t.speaker} (${t.originalLanguage}): ${t.originalText}${translation}`;
      })
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

      const data = await response.json();
      const rawContent = data.choices[0].message.content ?? "";
      const sanitizedContent = rawContent
        .replace(/```json\s*/g, "")
        .replace(/```/g, "")
        .trim();
      const jsonMatch = sanitizedContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON object found in summary response");
      }
      const result = JSON.parse(jsonMatch[0]);

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

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error("Translation failed:", error);
      return args.text; // Return original text if translation fails
    }
  },
});
