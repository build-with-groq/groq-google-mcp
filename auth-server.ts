// Hono server for OAuth callback
// Usage: deno task auth-server

import "jsr:@std/dotenv/load"; // needed for deno run; not req for smallweb or valtown
import { Hono } from "hono";

const app = new Hono();

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const PORT = parseInt(Deno.env.get("AUTH_PORT") || "8000");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in .env");
  Deno.exit(1);
}

// OAuth callback handler
app.get("/callback", async (c) => {
  const code = c.req.query("code");

  if (!code) {
    // Redirect to home if no auth code
    return c.redirect("/");
  }

  // Exchange code for token
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        redirect_uri: `http://localhost:${PORT}/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      // Redirect to home on token exchange failure
      return c.redirect("/");
    }

    const tokenData = await tokenResponse.json();

    // Build env content (only access token needed for Groq MCP)
    const envContent = `GOOGLE_AUTHORIZATION=${tokenData.access_token}`;
    
    // Escape for HTML (prevent XSS)
    const envContentEscaped = envContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // Display success page with token
    return c.html(`
      <html>
        <head>
          <style>
            body { font-family: system-ui; padding: 2rem; max-width: 600px; margin: 0 auto; }
            pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; margin: 1rem 0; }
            button { 
              background: #007bff; 
              color: white; 
              border: none; 
              padding: 0.5rem 1rem; 
              border-radius: 4px; 
              cursor: pointer;
              font-size: 1rem;
              margin-top: 0.5rem;
            }
            button:hover { background: #0056b3; }
            button:active { background: #004085; }
            #copied { color: #28a745; margin-left: 0.5rem; display: none; }
          </style>
        </head>
        <body>
          <h1>✅ Authentication Successful!</h1>
          <p>Add this to your .env file:</p>
          <pre id="token-content">${envContentEscaped}</pre>
          <button onclick="copyToClipboard()">Copy to Clipboard</button>
          <span id="copied">✓ Copied!</span>
          <p style="margin-top: 1.5rem;"><strong>You can close this window.</strong></p>
          <script>
            function copyToClipboard() {
              const content = document.getElementById('token-content').textContent;
              navigator.clipboard.writeText(content).then(function() {
                const copied = document.getElementById('copied');
                copied.style.display = 'inline';
                setTimeout(function() {
                  copied.style.display = 'none';
                }, 2000);
              }).catch(function(err) {
                alert('Failed to copy: ' + err);
              });
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    // Redirect to home on any error
    return c.redirect("/");
  }
});

// Start auth flow endpoint
app.get("/auth", (c) => {
  const scopes = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
  ].join(" ");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", `http://localhost:${PORT}/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return c.redirect(authUrl.toString());
});

// Health check
app.get("/", (c) => {
  return c.html(`
    <html>
      <body style="font-family: system-ui; padding: 2rem; max-width: 600px; margin: 0 auto;">
        <h1>OAuth Server</h1>
        <p><a href="/auth">Start OAuth Flow</a></p>
      </body>
    </html>
  `);
});

console.log(`🚀 OAuth server running on http://localhost:${PORT}`);
console.log(`📋 Visit http://localhost:${PORT}/auth to start authentication\n`);

// Export app.fetch for Val Town, otherwise export app — this is only for hono apps
export default (typeof Deno !== "undefined" && Deno.env.get("valtown")) ? app.fetch : app;

// For local Deno, serve the app
if (typeof Deno !== "undefined" && !Deno.env.get("valtown")) {
  Deno.serve({ port: PORT }, app.fetch);
}

