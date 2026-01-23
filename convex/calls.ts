import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";

export const startCall = mutation({
  args: {
    primaryLanguage: v.string(),
    secondaryLanguage: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const callId = await ctx.db.insert("calls", {
      userId,
      title: `${args.primaryLanguage} ↔ ${args.secondaryLanguage} Call`,
      primaryLanguage: args.primaryLanguage,
      secondaryLanguage: args.secondaryLanguage,
      duration: 0,
      status: "active",
      startedAt: Date.now(),
    });

    return callId;
  },
});

export const endCall = mutation({
  args: {
    callId: v.id("calls"),
    duration: v.number(),
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

    await ctx.db.patch(args.callId, {
      status: "completed",
      duration: args.duration,
      endedAt: Date.now(),
    });

    return args.callId;
  },
});

export const updateCallSummary = internalMutation({
  args: {
    callId: v.id("calls"),
    summary: v.string(),
    keyPoints: v.array(v.string()),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      summary: args.summary,
      keyPoints: args.keyPoints,
      title: args.title,
    });
  },
});

export const getCall = query({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const call = await ctx.db.get(args.callId);
    if (!call || call.userId !== userId) {
      return null;
    }

    return call;
  },
});

export const listCalls = query({
  args: {
    paginationOpts: paginationOptsValidator,
    primaryLanguage: v.optional(v.string()),
    secondaryLanguage: v.optional(v.string()),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    let query = ctx.db
      .query("calls")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc");

    if (args.dateFrom) {
      query = query.filter((q) => q.gte(q.field("startedAt"), args.dateFrom!));
    }

    if (args.dateTo) {
      query = query.filter((q) => q.lte(q.field("startedAt"), args.dateTo!));
    }

    if (args.primaryLanguage) {
      query = query.filter((q) => q.eq(q.field("primaryLanguage"), args.primaryLanguage!));
    }

    if (args.secondaryLanguage) {
      query = query.filter((q) => q.eq(q.field("secondaryLanguage"), args.secondaryLanguage!));
    }

    return await query.paginate(args.paginationOpts);
  },
});

export const searchCalls = query({
  args: {
    searchTerm: v.string(),
    paginationOpts: paginationOptsValidator,
    primaryLanguage: v.optional(v.string()),
    secondaryLanguage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    let query = ctx.db
      .query("calls")
      .withSearchIndex("search_content", (q) => {
        let baseQuery = q.search("title", args.searchTerm).eq("userId", userId);
        if (args.primaryLanguage) {
          baseQuery = baseQuery.eq("primaryLanguage", args.primaryLanguage);
        }
        if (args.secondaryLanguage) {
          baseQuery = baseQuery.eq("secondaryLanguage", args.secondaryLanguage);
        }
        return baseQuery;
      });

    return await query.paginate(args.paginationOpts);
  },
});
