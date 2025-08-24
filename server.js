import express from "express";
import cookieParser from "cookie-parser";
import { config } from "dotenv";
import path from "path";
import * as discord from "./discord.js";
import * as storage from "./storage.js";
import mongoose from "mongoose";

config();

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const app = express();
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.static("public"));
app.use(express.json());

// MongoDB bağlantısını başlat
async function connectToDB() {
	try {
		await mongoose.connect(process.env.MONGO_URI, {});
		console.log("✅ MongoDB'ye başarıyla bağlanıldı");
	} catch (error) {
		console.error("❌ MongoDB bağlantı hatası:", error);
		process.exit(1);
	}
}
connectToDB();

/**
 * Kullanıcının Discord metadata'sını günceller.
 * Veritabanındaki sayaçlara göre rolleri belirler.
 */
async function updateMetadata(userId) {
	const tokens = await storage.getDiscordTokens(userId);
	if (!tokens) {
		console.error(`Kullanıcı ${userId} için token bulunamadı`);
		return;
	}

	// Kullanıcının sayaçlarını veritabanından al
	const userData = await storage.getUserData(userId);
	const timelapseCount = userData?.timelapseCount || 0;
	const resolvedTickets = userData?.resolvedTickets || 0; // Use new resolution-based tracking

	const metadata = {
		time_master: timelapseCount >= 10,
		issue_tracker: resolvedTickets, // Now based on actual resolutions, not manual counts
	};

	console.log(`📡 ${userId} için metadata gönderiliyor:`, metadata);
	console.log(
		`📊 Kullanıcı verileri - timelapseCount: ${timelapseCount}, resolvedTickets: ${resolvedTickets}`,
	);
	try {
		await discord.pushMetadata(userId, tokens, metadata);
		console.log(`✅ ${userId} için metadata başarıyla güncellendi`);
	} catch (e) {
		console.error(`❌ ${userId} için metadata güncelleme hatası:`, e);
	}
}

app.get("/", (req, res) => res.send("👋"));

app.get("/linked-role", async (req, res) => {
	const { url, state } = discord.getOAuthUrl();
	res.cookie("clientState", state, { maxAge: 5 * 60 * 1000, signed: true });
	res.redirect(url);
});

app.get("/discord-oauth-callback", async (req, res) => {
	try {
		const code = req.query["code"];
		const discordState = req.query["state"];
		const { clientState } = req.signedCookies;

		if (clientState !== discordState) {
			console.error("State doğrulama başarısız.");
			return res.sendStatus(403);
		}

		const tokens = await discord.getOAuthTokens(code);
		const meData = await discord.getUserData(tokens);
		const userId = meData.user.id;
		await storage.storeDiscordTokens(userId, {
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token,
			expires_at: Date.now() + tokens.expires_in * 1000,
		});

		// OAuth tamamlandı - metadata'yı güncelle
		await updateMetadata(userId);
		res.sendFile(path.resolve(__dirname, "discord-oauth-callback.html"));
	} catch (e) {
		console.error("OAuth callback hatası:", e);
		res.sendStatus(500);
	}
});

app.post("/update-metadata", async (req, res) => {
	try {
		const userId = req.body.userId;
		await updateMetadata(userId);
		res.sendStatus(204);
	} catch (e) {
		console.error("/update-metadata hatası:", e);
		res.sendStatus(500);
	}
});

// New endpoint for timelapse increment and metadata update
app.post("/increment-timelapse", async (req, res) => {
	try {
		const userId = req.body.userId;
		if (!userId) {
			return res.sendStatus(400); // Bad request if no userId
		}
		await storage.incrementTimelapseCount(userId);
		await updateMetadata(userId);
		res.sendStatus(204);
	} catch (e) {
		console.error("/increment-timelapse hatası:", e);
		res.sendStatus(500);
	}
});

// New endpoint for issue_tracker increment and metadata update
app.post("/increment-issue-tracker", async (req, res) => {
	try {
		const userId = req.body.userId;
		if (!userId) {
			return res.sendStatus(400); // Bad request if no userId
		}
		await storage.incrementTicketCount(userId);
		await updateMetadata(userId);
		res.sendStatus(204);
	} catch (e) {
		console.error("/increment-issue-tracker hatası:", e);
		res.sendStatus(500);
	}
});

// New endpoint for setting linked role values (bot owner only)
app.post("/set-linkedrole-value", async (req, res) => {
	try {
		const { userId, roleType, value } = req.body;

		if (!userId || !roleType || value === undefined) {
			return res.sendStatus(400); // Bad request if missing parameters
		}

		if (typeof value !== "number" || value < 0) {
			return res.sendStatus(400); // Bad request if value is not a positive number
		}

		// Set the appropriate count based on role type
		if (roleType === "timelapse") {
			await storage.setTimelapseCount(userId, value);
		} else if (roleType === "issue_tracker") {
			await storage.setTicketCount(userId, value);
		} else {
			return res.sendStatus(400); // Bad request if invalid role type
		}

		// Update metadata after setting the value
		await updateMetadata(userId);
		res.sendStatus(204);
	} catch (e) {
		console.error("/set-linkedrole-value hatası:", e);
		res.sendStatus(500);
	}
});

// New endpoint for recording ticket resolutions
app.post("/record-ticket-resolution", async (req, res) => {
	try {
		const { userId, guildId, threadId, resolvedBy, resolutionType } = req.body;

		if (!userId || !guildId || !threadId || !resolvedBy) {
			return res.sendStatus(400); // Bad request if missing parameters
		}

		const success = await storage.recordTicketResolution(
			userId,
			guildId,
			threadId,
			resolvedBy,
			resolutionType || "completed",
		);

		if (success) {
			// Update metadata after recording resolution
			await updateMetadata(userId);
			res.sendStatus(204);
		} else {
			res.sendStatus(429); // Too Many Requests (rate limited)
		}
	} catch (e) {
		console.error("/record-ticket-resolution hatası:", e);
		res.sendStatus(500);
	}
});

// Debug endpoint to check user data and metadata
app.get("/debug-user/:userId", async (req, res) => {
	try {
		const userId = req.params.userId;

		// Get user data from database
		const userData = await storage.getUserData(userId);
		const tokens = await storage.getDiscordTokens(userId);

		const response = {
			userId,
			hasTokens: !!tokens,
			userData: userData || { timelapseCount: 0, ticketCount: 0, resolvedTickets: 0 },
			metadata: {
				time_master: (userData?.timelapseCount || 0) >= 10,
				issue_tracker: userData?.resolvedTickets || 0, // Show resolved tickets count
			},
			// Additional debug info
			debugInfo: {
				legacyTicketCount: userData?.ticketCount || 0,
				resolvedTickets: userData?.resolvedTickets || 0,
				resolutionsToday: userData?.resolutionsToday || 0,
				guildsWithResolutions: userData?.guildsWithResolutions || [],
				lastResolutionTime: userData?.lastResolutionTime || null,
			},
		};

		// If user has tokens, try to get current metadata from Discord
		if (tokens) {
			try {
				const discordMetadata = await discord.getMetadata(userId, tokens);
				response.discordMetadata = discordMetadata;
			} catch (e) {
				response.discordMetadataError = e.message;
			}
		}

		res.json(response);
	} catch (e) {
		console.error("/debug-user hatası:", e);
		res.status(500).json({ error: e.message });
	}
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
	console.log(`🚀 Sunucu ${port} portunda çalışıyor`);
});
