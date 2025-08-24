import { TokenModel, UserDataModel } from "./linked_roles/models.js";

export async function storeDiscordTokens(userId, tokens) {
	await TokenModel.findOneAndUpdate({ userId }, { tokens }, { upsert: true });
}

export async function getDiscordTokens(userId) {
	const doc = await TokenModel.findOne({ userId });
	return doc?.tokens || null;
}

export async function getUserData(userId) {
	return await UserDataModel.findOne({ userId });
}

export async function incrementTimelapseCount(userId) {
	await UserDataModel.findOneAndUpdate(
		{ userId },
		{ $inc: { timelapseCount: 1 } },
		{ upsert: true },
	);
}

export async function incrementTicketCount(userId) {
	await UserDataModel.findOneAndUpdate({ userId }, { $inc: { ticketCount: 1 } }, { upsert: true });
}

export async function setTimelapseCount(userId, count) {
	await UserDataModel.findOneAndUpdate({ userId }, { timelapseCount: count }, { upsert: true });
}

export async function setTicketCount(userId, count) {
	await UserDataModel.findOneAndUpdate({ userId }, { ticketCount: count }, { upsert: true });
}

export async function recordTicketResolution(
	userId,
	guildId,
	threadId,
	resolvedBy,
	resolutionType = "completed",
) {
	try {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

		// Get current user data
		const userData = await UserDataModel.findOne({ userId });

		// Anti-abuse checks
		if (userData) {
			// Reset daily counter if it's a new day
			const lastReset = userData.lastResetDate ? new Date(userData.lastResetDate) : new Date(0);
			const lastResetDay = new Date(
				lastReset.getFullYear(),
				lastReset.getMonth(),
				lastReset.getDate(),
			);

			if (today.getTime() !== lastResetDay.getTime()) {
				// New day, reset counter
				await UserDataModel.findOneAndUpdate(
					{ userId },
					{
						resolutionsToday: 0,
						lastResetDate: now,
					},
				);
			}

			// Check daily limit (max 5 resolutions per day to prevent abuse)
			if (userData.resolutionsToday >= 5) {
				console.warn(`⚠️ User ${userId} has reached daily resolution limit`);
				return false;
			}

			// Check rate limiting (max 1 resolution per 10 minutes)
			if (userData.lastResolutionTime) {
				const timeSinceLastResolution = now.getTime() - userData.lastResolutionTime.getTime();
				const tenMinutes = 10 * 60 * 1000;

				if (timeSinceLastResolution < tenMinutes) {
					console.warn(`⚠️ User ${userId} is rate limited for ticket resolutions`);
					return false;
				}
			}

			// Check if user is trying to farm across too many guilds (max 3 guilds)
			const guildsWithResolutions = userData.guildsWithResolutions || [];
			if (!guildsWithResolutions.includes(guildId) && guildsWithResolutions.length >= 3) {
				console.warn(`⚠️ User ${userId} has resolved tickets in too many guilds`);
				return false;
			}
		}

		// Only count 'completed' resolutions for the linked role
		const shouldIncrementCounter = resolutionType === "completed";

		// Record the resolution
		const updateData = {
			$push: {
				ticketResolutions: {
					guildId,
					threadId,
					resolvedAt: now,
					resolvedBy,
					resolutionType,
				},
			},
			$inc: {
				resolutionsToday: 1,
			},
			$set: {
				lastResolutionTime: now,
			},
			$addToSet: {
				guildsWithResolutions: guildId,
			},
		};

		// Only increment resolvedTickets for completed tickets
		if (shouldIncrementCounter) {
			updateData.$inc.resolvedTickets = 1;
		}

		await UserDataModel.findOneAndUpdate({ userId }, updateData, { upsert: true });

		console.log(
			`✅ Ticket resolution recorded for user ${userId} in guild ${guildId} (type: ${resolutionType})`,
		);
		return true;
	} catch (error) {
		console.error(`❌ Failed to record ticket resolution for user ${userId}:`, error);
		throw error;
	}
}

export async function getResolvedTicketCount(userId) {
	try {
		const userData = await UserDataModel.findOne({ userId });
		return userData?.resolvedTickets || 0;
	} catch (error) {
		console.error(`❌ Failed to get resolved ticket count for user ${userId}:`, error);
		throw error;
	}
}
