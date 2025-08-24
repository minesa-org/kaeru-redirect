import fetch from "node-fetch";
import { config } from "dotenv";
config();

const url = `https://discord.com/api/v10/applications/${process.env.CLIENT_ID}/role-connections/metadata`;

const body = [
	{
		key: "time_master",
		name: "Time Master",
		name_localizations: { tr: "Zaman Ustası" },
		description:
			"A role for users who master time manipulation by using /timelapse 10 times.",
		description_localizations: {
			tr: "/timelapse komutunu 10 defa kullanan kullanıcılar için rol.",
		},
		type: 7, // boolean_eq
	},
	{
		key: "issue_tracker",
		name: "Issue Tracker Count",
		name_localizations: { tr: "Hata Takipçisi Sayısı" },
		description: "Number of tickets opened by the user.",
		description_localizations: {
			tr: "Kullanıcının açtığı bilet sayısı.",
		},
		type: 2, // integer_greater_than_or_equal
	},
];

const response = await fetch(url, {
	method: "PUT",
	body: JSON.stringify(body),
	headers: {
		"Content-Type": "application/json",
		Authorization: `Bot ${process.env.CLIENT_TOKEN}`,
	},
});

if (response.ok) {
	const data = await response.json();
	console.log("✅ Metadata başarıyla kaydedildi:", data);
} else {
	const data = await response.text();
	console.error("❌ Metadata kaydetme hatası:", data);
}
