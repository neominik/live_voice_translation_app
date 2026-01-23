import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  calls: defineTable({
    userId: v.id("users"),
    title: v.string(),
    primaryLanguage: v.string(),
    secondaryLanguage: v.string(),
    duration: v.number(), // in seconds
    status: v.union(v.literal("active"), v.literal("completed"), v.literal("failed")),
    summary: v.optional(v.string()),
    keyPoints: v.optional(v.array(v.string())),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_date", ["userId", "startedAt"])
    .searchIndex("search_content", {
      searchField: "title",
      filterFields: ["userId", "primaryLanguage", "secondaryLanguage"],
    }),

  transcripts: defineTable({
    callId: v.id("calls"),
    userId: v.id("users"),
    timestamp: v.number(),
    speaker: v.union(v.literal("user"), v.literal("other")),
    originalText: v.string(),
    originalLanguage: v.string(),
    translatedText: v.string(),
    translatedLanguage: v.string(),
    confidence: v.optional(v.number()),
  })
    .index("by_call", ["callId"])
    .index("by_call_and_timestamp", ["callId", "timestamp"])
    .searchIndex("search_transcript", {
      searchField: "originalText",
      filterFields: ["callId", "userId"],
    }),

  userSettings: defineTable({
    userId: v.id("users"),
    preferredPrimaryLanguage: v.string(),
    preferredSecondaryLanguage: v.string(),
    voiceSettings: v.object({
      inputGain: v.number(),
      outputVolume: v.number(),
      autoTranslate: v.boolean(),
    }),
  }).index("by_user", ["userId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
