// CLI for Google OAuth authentication
// Usage: deno task auth

import { getGoogleAuthToken } from "./auth.ts";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const PORT = parseInt(Deno.env.get("AUTH_PORT") || "8080");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in .env");
  console.error("\nTo get these credentials:");
  console.error("1. Go to https://console.cloud.google.com/apis/credentials");
  console.error("2. Create OAuth 2.0 Client ID credentials");
  console.error("3. Add http://localhost:8080 to authorized redirect URIs");
  console.error("4. Add the CLIENT_ID and CLIENT_SECRET to your .env file\n");
  Deno.exit(1);
}

try {
  const result = await getGoogleAuthToken({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    port: PORT,
  });

  console.log("\n✅ Authentication successful!\n");
  console.log("Add this to your .env file:\n");
  console.log(`GOOGLE_AUTHORIZATION=${result.accessToken}\n`);

  if (result.refreshToken) {
    console.log(`GOOGLE_REFRESH_TOKEN=${result.refreshToken}\n`);
  }

  // Also copy to clipboard if possible
  try {
    const copyCommand = Deno.build.os === "darwin"
      ? `echo "${result.accessToken}" | pbcopy`
      : Deno.build.os === "linux"
      ? `echo "${result.accessToken}" | xclip -selection clipboard`
      : null;

    if (copyCommand) {
      await Deno.run({
        cmd: ["sh", "-c", copyCommand],
      }).status();
      console.log("📋 Access token copied to clipboard!\n");
    }
  } catch {
    // Ignore clipboard errors
  }
} catch (error) {
  console.error("\n❌ Authentication failed:", error.message);
  Deno.exit(1);
}

