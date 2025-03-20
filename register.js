import fetch from "node-fetch";
import { config } from "dotenv";
config();

const url = `https://discord.com/api/v10/applications/${process.env.CLIENT_ID}/role-connections/metadata`;

const body = [
  {
    key: "is_staff",
    name: "Staff",
    description: "A role for team members. Claimable by Minesa Team.",
    type: 7, // boolean_eq
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
  console.log("✅ Metadata registered successfully:", data);
} else {
  const data = await response.text();
  console.error("❌ Error registering metadata:", data);
}
