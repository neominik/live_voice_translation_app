import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getUserSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const userId = identity.subject;

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return (
      settings || {
        preferredPrimaryLanguage: "English",
        preferredSecondaryLanguage: "Spanish",
        voiceSettings: {
          inputGain: 0.8,
          outputVolume: 0.8,
          autoTranslate: true,
        },
      }
    );
  },
});

export const updateUserSettings = mutation({
  args: {
    preferredPrimaryLanguage: v.string(),
    preferredSecondaryLanguage: v.string(),
    voiceSettings: v.object({
      inputGain: v.number(),
      outputVolume: v.number(),
      autoTranslate: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const userId = identity.subject;

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        ...args,
      });
    }
  },
});
