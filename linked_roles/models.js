import mongoose from "mongoose";

const tokenSchema = new mongoose.Schema({
	userId: { type: String, required: true, unique: true },
	tokens: {
		access_token: String,
		refresh_token: String,
		expires_at: Number,
	},
});

const userDataSchema = new mongoose.Schema({
	userId: { type: String, required: true, unique: true },
	timelapseCount: { type: Number, default: 0 },
	ticketCount: { type: Number, default: 0 }, // Legacy field - kept for compatibility
	resolvedTickets: { type: Number, default: 0 }, // New field for actual resolutions
	ticketResolutions: [
		{
			guildId: String,
			threadId: String,
			resolvedAt: { type: Date, default: Date.now },
			resolvedBy: String, // User ID who resolved it
			resolutionType: {
				type: String,
				enum: ["completed", "duplicate", "comment"],
				default: "completed",
			},
		},
	],
	// Anti-abuse tracking
	lastResolutionTime: Date,
	resolutionsToday: { type: Number, default: 0 },
	lastResetDate: { type: Date, default: Date.now },
	guildsWithResolutions: [String], // Track which guilds user has resolved tickets in
});

export const TokenModel = mongoose.model("Token", tokenSchema);
export const UserDataModel = mongoose.model("UserData", userDataSchema);
