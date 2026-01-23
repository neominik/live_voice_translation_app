import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const addTranscript = mutation({
  args: {
    callId: v.id("calls"),
    speaker: v.union(v.literal("user"), v.literal("other")),
    originalText: v.string(),
    originalLanguage: v.string(),
    translatedText: v.string(),
    translatedLanguage: v.string(),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const call = await ctx.db.get(args.callId);
    if (!call || call.userId !== userId) {
      throw new Error("Call not found or unauthorized");
    }

    return await ctx.db.insert("transcripts", {
      callId: args.callId,
      userId,
      timestamp: Date.now(),
      speaker: args.speaker,
      originalText: args.originalText,
      originalLanguage: args.originalLanguage,
      translatedText: args.translatedText,
      translatedLanguage: args.translatedLanguage,
      confidence: args.confidence,
    });
  },
});

export const getTranscripts = query({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const call = await ctx.db.get(args.callId);
    if (!call || call.userId !== userId) {
      return [];
    }

    return await ctx.db
      .query("transcripts")
      .withIndex("by_call_and_timestamp", (q) => q.eq("callId", args.callId))
      .order("asc")
      .collect();
  },
});

export const searchTranscripts = query({
  args: {
    callId: v.id("calls"),
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const call = await ctx.db.get(args.callId);
    if (!call || call.userId !== userId) {
      return [];
    }

    return await ctx.db
      .query("transcripts")
      .withSearchIndex("search_transcript", (q) =>
        q.search("originalText", args.searchTerm).eq("callId", args.callId)
      )
      .collect();
  },
});

export const getTranscriptsForSummary = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transcripts")
      .withIndex("by_call_and_timestamp", (q) => q.eq("callId", args.callId))
      .order("asc")
      .collect();
  },
});
