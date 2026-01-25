import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";

export const addTranscript = mutation({
  args: {
    callId: v.id("calls"),
    originalText: v.string(),
    confidence: v.optional(v.number()),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const userId = identity.subject;

    const call = await ctx.db.get(args.callId);
    if (!call || call.userId !== userId) {
      throw new Error("Call not found or unauthorized");
    }

    return await ctx.db.insert("transcripts", {
      callId: args.callId,
      userId,
      timestamp: args.timestamp ?? Date.now(),
      originalText: args.originalText,
      confidence: args.confidence,
    });
  },
});

export const getTranscripts = query({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const userId = identity.subject;

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const userId = identity.subject;

    const call = await ctx.db.get(args.callId);
    if (!call || call.userId !== userId) {
      return [];
    }

    return await ctx.db
      .query("transcripts")
      .withSearchIndex("search_transcript", (q) =>
        q.search("originalText", args.searchTerm).eq("callId", args.callId),
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
