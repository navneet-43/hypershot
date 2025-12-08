import { pgTable, text, serial, integer, boolean, timestamp, json, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// Sessions table for persistent login
export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// Legacy users table (for Facebook OAuth users)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password"),
  email: text("email").notNull(),
  fullName: text("full_name"),
  facebookId: text("facebook_id"),
  facebookToken: text("facebook_token"),
  createdAt: timestamp("created_at").defaultNow(),
});

// New platform users table (independent authentication)
export const platformUsers = pgTable("platform_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: text("role").default("user"), // user, admin
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  fullName: true,
  facebookId: true,
  facebookToken: true,
});

export const insertPlatformUserSchema = createInsertSchema(platformUsers).pick({
  username: true,
  password: true,
  email: true,
  fullName: true,
  role: true,
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Invalid email address"),
  fullName: z.string().min(1, "Full name is required"),
});

// Facebook accounts model
export const facebookAccounts = pgTable("facebook_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id), // Legacy OAuth user
  platformUserId: integer("platform_user_id").references(() => platformUsers.id), // New platform user
  name: text("name").notNull(),
  pageId: text("page_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFacebookAccountSchema = createInsertSchema(facebookAccounts).pick({
  userId: true,
  platformUserId: true,
  name: true, 
  pageId: true,
  accessToken: true,
  isActive: true,
});

// Instagram accounts model
export const instagramAccounts = pgTable("instagram_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id), // Legacy OAuth user
  platformUserId: integer("platform_user_id").references(() => platformUsers.id), // New platform user
  username: text("username").notNull(),
  businessAccountId: text("business_account_id").notNull().unique(),
  connectedPageId: text("connected_page_id").notNull(), // Facebook Page ID it's connected to
  accessToken: text("access_token").notNull(),
  profilePictureUrl: text("profile_picture_url"),
  followersCount: integer("followers_count").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInstagramAccountSchema = createInsertSchema(instagramAccounts).pick({
  userId: true,
  platformUserId: true,
  username: true,
  businessAccountId: true,
  connectedPageId: true,
  accessToken: true,
  profilePictureUrl: true,
  followersCount: true,
  isActive: true,
});

export type InstagramAccount = typeof instagramAccounts.$inferSelect;

// Snapchat accounts model
export const snapchatAccounts = pgTable("snapchat_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id), // Legacy OAuth user
  platformUserId: integer("platform_user_id").references(() => platformUsers.id), // New platform user
  displayName: text("display_name").notNull(),
  externalId: text("external_id").notNull().unique(), // Snapchat user ID
  profileId: text("profile_id").notNull(), // Public Profile ID for publishing
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  profilePictureUrl: text("profile_picture_url"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSnapchatAccountSchema = createInsertSchema(snapchatAccounts).pick({
  userId: true,
  platformUserId: true,
  displayName: true,
  externalId: true,
  profileId: true,
  accessToken: true,
  refreshToken: true,
  tokenExpiresAt: true,
  profilePictureUrl: true,
  isActive: true,
});

export type SnapchatAccount = typeof snapchatAccounts.$inferSelect;
export type InsertSnapchatAccount = z.infer<typeof insertSnapchatAccountSchema>;

// Google Sheets integration model
export const googleSheetsIntegrations = pgTable("google_sheets_integrations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  folderId: text("folder_id"),
  spreadsheetId: text("spreadsheet_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGoogleSheetsIntegrationSchema = createInsertSchema(googleSheetsIntegrations).pick({
  userId: true,
  accessToken: true,
  refreshToken: true,
  folderId: true,
  spreadsheetId: true,
});

// Custom labels model
export const customLabels = pgTable("custom_labels", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  color: text("color").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomLabelSchema = createInsertSchema(customLabels).pick({
  userId: true,
  name: true,
  color: true,
});

// Posts model
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  platform: text("platform").notNull().default("facebook"), // facebook, instagram, or snapchat
  accountId: integer("account_id").references(() => facebookAccounts.id),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type").default("none"), // none, photo, video, reel, story
  link: text("link"),
  labels: json("labels").$type<string[]>().default([]),
  language: text("language").default("English"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: false }),
  publishedAt: timestamp("published_at"),
  status: text("status").notNull(),
  facebookPostId: text("facebook_post_id"), // Facebook post ID
  sheetRowId: text("sheet_row_id"),
  errorMessage: text("error_message"),
  postToInstagram: boolean("post_to_instagram").default(false), // Legacy field, kept for backward compatibility
  instagramAccountId: integer("instagram_account_id").references(() => instagramAccounts.id),
  instagramPostId: text("instagram_post_id"),
  snapchatAccountId: integer("snapchat_account_id").references(() => snapchatAccounts.id),
  snapchatStoryId: text("snapchat_story_id"), // Snapchat story/spotlight ID
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPostSchema = createInsertSchema(posts).pick({
  userId: true,
  platform: true,
  accountId: true,
  content: true,
  mediaUrl: true,
  mediaType: true,
  link: true,
  labels: true,
  language: true,
  scheduledFor: true,
  publishedAt: true,
  status: true,
  facebookPostId: true,
  sheetRowId: true,
  errorMessage: true,
  postToInstagram: true,
  instagramAccountId: true,
  instagramPostId: true,
  snapchatAccountId: true,
  snapchatStoryId: true,
}).extend({
  scheduledFor: z.union([z.string(), z.date()]).optional().transform((val) => {
    if (val instanceof Date) return val;
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
});

// Activities model
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => platformUsers.id),
  type: text("type").notNull(),
  description: text("description").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activities).pick({
  userId: true,
  type: true,
  description: true,
  metadata: true,
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  facebookAccounts: many(facebookAccounts),
  googleSheetsIntegrations: many(googleSheetsIntegrations),
  customLabels: many(customLabels),
  posts: many(posts),
  activities: many(activities),
}));

export const facebookAccountsRelations = relations(facebookAccounts, ({ one, many }) => ({
  user: one(users, {
    fields: [facebookAccounts.userId],
    references: [users.id],
  }),
  posts: many(posts),
}));

export const googleSheetsIntegrationsRelations = relations(googleSheetsIntegrations, ({ one }) => ({
  user: one(users, {
    fields: [googleSheetsIntegrations.userId],
    references: [users.id],
  }),
}));

export const customLabelsRelations = relations(customLabels, ({ one }) => ({
  user: one(users, {
    fields: [customLabels.userId],
    references: [users.id],
  }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  user: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
  facebookAccount: one(facebookAccounts, {
    fields: [posts.accountId],
    references: [facebookAccounts.id],
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  user: one(platformUsers, {
    fields: [activities.userId],
    references: [platformUsers.id],
  }),
}));

export const platformUsersRelations = relations(platformUsers, ({ many }) => ({
  activities: many(activities),
}));

// Export all types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type PlatformUser = typeof platformUsers.$inferSelect;
export type InsertPlatformUser = z.infer<typeof insertPlatformUserSchema>;
export type LoginCredentials = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;

export type FacebookAccount = typeof facebookAccounts.$inferSelect;
export type InsertFacebookAccount = z.infer<typeof insertFacebookAccountSchema>;

export type GoogleSheetsIntegration = typeof googleSheetsIntegrations.$inferSelect;
export type InsertGoogleSheetsIntegration = z.infer<typeof insertGoogleSheetsIntegrationSchema>;

export type CustomLabel = typeof customLabels.$inferSelect;
export type InsertCustomLabel = z.infer<typeof insertCustomLabelSchema>;

export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
