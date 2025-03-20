import express from "express";
import cookieParser from "cookie-parser";
import { config } from "dotenv";
import path from "path";
import * as discord from "./discord.js";
import * as storage from "./storage.js";

config();

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const app = express();
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.static("public"));
app.use(express.json());

// Enum tanımı
const Roles = {
    ADMIN: 1,
    MOD: 2,
};

/*
  Hardcoded allowed user IDs for each role.
*/
const allowedIDs = {
    is_staff: [
        { "285118390031351809": Roles.ADMIN }, // neo
        { "721032593511940177": Roles.MOD }, // Miya (bu ID'yi gerçek Miya ID'si ile değiştirin)
    ],
};

/**
 * Updates the Discord metadata for the user.
 * It sets each role based on the hardcoded allowed IDs.
 */
async function updateMetadata(userId) {
    const tokens = await storage.getDiscordTokens(userId);
    if (!tokens) {
        console.error(`No tokens found for user ${userId}`);
        return;
    }

    // Kullanıcının rolünü belirle
    let staffRole = false;
    for (const entry of allowedIDs.is_staff) {
        if (entry.hasOwnProperty(userId)) {
            staffRole = entry[userId];
            break;
        }
    }

    const metadata = {
        is_staff: staffRole,
    };

    console.log(`📡 Pushing metadata for ${userId}:`, metadata);
    try {
        await discord.pushMetadata(userId, tokens, metadata);
        console.log(`✅ Successfully updated metadata for ${userId}`);
    } catch (e) {
        console.error(`❌ Error updating metadata for ${userId}:`, e);
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
            console.error("State verification failed.");
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

        // Update metadata based on hardcoded allowed IDs.
        await updateMetadata(userId);
        res.sendFile(path.resolve(__dirname, "discord-oauth-callback.html"));
    } catch (e) {
        console.error("Error in OAuth callback:", e);
        res.sendStatus(500);
    }
});

app.post("/update-metadata", async (req, res) => {
    try {
        const userId = req.body.userId;
        await updateMetadata(userId);
        res.sendStatus(204);
    } catch (e) {
        console.error("Error in /update-metadata:", e);
        res.sendStatus(500);
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
