import crypto from "crypto";
import fetch from "node-fetch";
import { config } from "dotenv";
config();

import * as storage from "./storage.js";

export function getOAuthUrl() {
	const state = crypto.randomUUID();
	const url = new URL("https://discord.com/api/oauth2/authorize");
	url.searchParams.set("client_id", process.env.CLIENT_ID);
	url.searchParams.set("redirect_uri", process.env.REDIRECT_URI);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("state", state);
	url.searchParams.set("scope", "role_connections.write identify");
	url.searchParams.set("prompt", "consent");
	return { state, url: url.toString() };
}

export async function getOAuthTokens(code) {
	const url = "https://discord.com/api/v10/oauth2/token";
	const body = new URLSearchParams({
		client_id: process.env.CLIENT_ID,
		client_secret: process.env.CLIENT_SECRET,
		grant_type: "authorization_code",
		code,
		redirect_uri: process.env.REDIRECT_URI,
	});

	const response = await fetch(url, {
		method: "POST",
		body,
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
	});

	if (response.ok) return await response.json();

	const errorText = await response.text();
	throw new Error(
		`❌ OAuth token alma hatası: [${response.status}] ${errorText}`,
	);
}

export async function getAccessToken(userId, tokens) {
	if (Date.now() > tokens.expires_at) {
		console.log(`🔄 ${userId} için access token yenileniyor...`);
		const url = "https://discord.com/api/v10/oauth2/token";
		const body = new URLSearchParams({
			client_id: process.env.CLIENT_ID,
			client_secret: process.env.CLIENT_SECRET,
			grant_type: "refresh_token",
			refresh_token: tokens.refresh_token,
		});

		const response = await fetch(url, {
			method: "POST",
			body,
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		});

		if (response.ok) {
			const newTokens = await response.json();
			newTokens.expires_at = Date.now() + newTokens.expires_in * 1000;
			await storage.storeDiscordTokens(userId, newTokens);
			return newTokens.access_token;
		}

		const errorText = await response.text();
		throw new Error(
			`❌ Access token yenileme hatası: [${response.status}] ${errorText}`,
		);
	}
	return tokens.access_token;
}

export async function getUserData(tokens) {
	const url = "https://discord.com/api/v10/oauth2/@me";
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${tokens.access_token}` },
	});

	if (response.ok) return await response.json();

	const errorText = await response.text();
	throw new Error(
		`❌ Kullanıcı verisi alma hatası: [${response.status}] ${errorText}`,
	);
}

export async function pushMetadata(userId, tokens, metadata) {
	const userData = await getUserData(tokens);

	const url = `https://discord.com/api/v10/users/@me/applications/${process.env.CLIENT_ID}/role-connection`;
	const accessToken = await getAccessToken(userId, tokens);

	const body = {
		platform_name: "Minesa™",
		platform_username: `@${userData.user.username}`,
		metadata,
	};

	console.log(
		`📡 ${userId} için metadata gönderiliyor:`,
		JSON.stringify(body, null, 2),
	);

	const response = await fetch(url, {
		method: "PUT",
		body: JSON.stringify(body),
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`❌ Metadata gönderme hatası: [${response.status}] ${errorText}`,
		);
	}
	console.log(`✅ ${userId} için metadata başarıyla güncellendi`);
}

export async function getMetadata(userId, tokens) {
	const url = `https://discord.com/api/v10/users/@me/applications/${process.env.CLIENT_ID}/role_connection`;
	const accessToken = await getAccessToken(userId, tokens);

	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (response.ok) return await response.json();

	const errorText = await response.text();
	throw new Error(
		`❌ Metadata alma hatası: [${response.status}] ${errorText}`,
	);
}
