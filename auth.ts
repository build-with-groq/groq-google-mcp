// Google OAuth 2.0 authentication utility
// Handles OAuth flow and returns access token

import "jsr:@std/dotenv/load"; // needed for deno run; not req for smallweb or valtown

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  scopes?: string[];
  port?: number;
}

export interface AuthResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];

const DEFAULT_PORT = 8080;

/**
 * Performs OAuth 2.0 flow and returns access token
 */
export async function getGoogleAuthToken(
  config: AuthConfig
): Promise<AuthResult> {
  const {
    clientId,
    clientSecret,
    redirectUri = `http://localhost:${config.port || DEFAULT_PORT}`,
    scopes = DEFAULT_SCOPES,
    port = DEFAULT_PORT,
  } = config;

  // Generate authorization URL
  const scopeString = scopes.join(" ");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopeString);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  // Start local server to receive callback
  const server = Deno.listen({ port, hostname: "localhost" });
  console.log(`\n🌐 Starting local server on http://localhost:${port}`);
  console.log(`\n📋 Opening browser for authentication...\n`);

  // Open browser
  const openCommand = Deno.build.os === "windows"
    ? `start ${authUrl.toString()}`
    : Deno.build.os === "darwin"
    ? `open ${authUrl.toString()}`
    : `xdg-open ${authUrl.toString()}`;

  try {
    await Deno.run({
      cmd: openCommand.split(" "),
    }).status();
  } catch {
    // If opening fails, just print the URL
    console.log(`Please open this URL in your browser:\n${authUrl.toString()}\n`);
  }

  // Wait for callback
  let code: string | null = null;
  let error: string | null = null;
  let errorDesc: string | null = null;

  for await (const conn of server) {
    const httpConn = Deno.serveHttp(conn);
    
    for await (const event of httpConn) {
      const { request } = event;
      const url = new URL(request.url);
      code = url.searchParams.get("code");
      error = url.searchParams.get("error");
      errorDesc = url.searchParams.get("error_description");

      if (!code) {
        await event.respondWith(
          new Response(
            `<html><body><h1>Authentication Failed</h1><p>${error || "No authorization code received"}${errorDesc ? `: ${errorDesc}` : ""}</p></body></html>`,
            {
              status: 400,
              headers: { "Content-Type": "text/html" },
            }
          )
        );
        server.close();
        throw new Error(error || "No authorization code received");
      }

      // Send success response
      await event.respondWith(
        new Response(
          "<html><body><h1>✅ Authentication Successful!</h1><p>You can close this window.</p></body></html>",
          {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }
        )
      );
      
      // Close server after handling request
      server.close();
      break;
    }
    break;
  }

  if (!code) {
    throw new Error("No authorization code received");
  }

  // Exchange code for token
  console.log("🔄 Exchanging authorization code for access token...\n");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
  };
}

