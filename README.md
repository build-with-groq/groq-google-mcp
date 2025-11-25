# Groq x Google MCP Connectors Demo

A demo application showing how to use [Groq's MCP (Model Context Protocol) integration](https://groq.com) to interact with Google services (Calendar, Gmail, Drive) using natural language queries.


https://github.com/user-attachments/assets/a1c2399e-ff9a-45fc-a364-833bc3500ea6



## Overview

This project demonstrates Groq's new Groq x Google MCP Connectors, which allow AI models to directly access and query your Google services. It includes:

- **CLI demos** — Simple command-line scripts for testing each connector
- **Web app** — Interactive interface with OAuth login for querying all three services

## Quick Start (CLI)

### Install Deno

This project uses Deno: a modern JavaScript/TypeScript runtime. If you don't have Deno installed:

**macOS / Linux:**
```bash
curl -fsSL https://deno.land/install.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://deno.land/install.ps1 | iex
```

For more installation options, visit [deno.land/manual/getting_started/installation](https://deno.land/manual/getting_started/installation)

### Get OAuth Token

The easiest way to get started is using the [OAuth Playground](https://developers.google.com/oauthplayground/):

1. Visit https://developers.google.com/oauthplayground/
2. Paste these scopes into "Input your own scopes":
   ```
   https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.readonly
   ```
3. Click "Authorize APIs" and log in with your Google account
4. Click "Exchange authorization code for tokens"
5. Copy the access token (starts with `ya29.a0...`)

### Configure Environment

Create a `.env` file:
```bash
GROQ_API_KEY=your_groq_api_key_here
GOOGLE_AUTHORIZATION=ya29.a0ATi6K2...  # Your access token
```

Run the demos:
```bash
deno task calendar  # Query your calendar
deno task gmail     # Search your email
deno task drive     # Browse your files
```

**Note:** Playground tokens expire after 1 hour.

## Web App Setup

### Install Deno

This project uses Deno, a modern JavaScript/TypeScript runtime. If you don't have Deno installed:

**macOS / Linux:**
```bash
curl -fsSL https://deno.land/install.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://deno.land/install.ps1 | iex
```

For more installation options, visit [deno.land/manual/getting_started/installation](https://deno.land/manual/getting_started/installation)

### 1. Create OAuth Credentials

For a persistent login, set up Google OAuth:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the APIs:
   - Click **+ Enable APIs and Services**
   - Search for and enable: **Gmail API**, **Google Calendar API**, **Google Drive API**
4. Configure OAuth consent screen:
   - Go to **APIs & Services** → **OAuth consent screen**
   - Choose **External** and click **Create**
   - Fill in the required app information and click **Save and Continue**
5. Add scopes to your app:
   - Click on your app, then go to **Data Access**
   - Click **Add or remove scopes**
   - Scroll down to **Manually add scopes** and paste:
     ```
     https://www.googleapis.com/auth/gmail.modify
     https://www.googleapis.com/auth/userinfo.email
     https://www.googleapis.com/auth/calendar.events
     https://www.googleapis.com/auth/drive.readonly
     ```
   - Click **Update**
6. Create OAuth credentials:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Choose **Web application**
   - Add authorized redirect URI: `http://localhost:8000/callback`
   - Save and copy your **Client ID** and **Client Secret**

### 2. Configure Environment

Create a `.env` file:
```bash
GROQ_API_KEY=your_groq_api_key_here
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
PORT=8000  # Optional, defaults to 8000
```

### 3. Run the App

```bash
deno task serve
```

Visit `http://localhost:8000`, click "Login with Google", and start querying your services!

## How It Works

Groq's MCP integration allows language models to use tools to interact with external services. When you ask a question:

1. Your query is sent to Groq's `/responses` endpoint with MCP tool configurations
2. The model decides which Google service to call and with what parameters
3. Groq executes the MCP tool call with your OAuth token
4. The model synthesizes the results into a natural language response

Example query: "What's on my schedule today?"
- Model calls Calendar MCP connector
- Retrieves your events
- Returns a formatted summary

## Architecture

```
User Query → Groq API (with MCP tools) → Google APIs → Groq Response
                        ↓
                OAuth Token (your credentials)
```

## Environment Variables

| Variable               | Required | Description                           |
|------------------------|----------|---------------------------------------|
| `GROQ_API_KEY`         | Yes      | Your Groq API key                     |
| `GOOGLE_AUTHORIZATION` | CLI only | OAuth access token (short-lived)      |
| `GOOGLE_CLIENT_ID`     | Web app  | OAuth client ID from Google Cloud     |
| `GOOGLE_CLIENT_SECRET` | Web app  | OAuth client secret from Google Cloud |
| `PORT`                 | No       | Server port (default: 8000)           |

## Project Structure

```
groq-google-mcp/
├── calendar.ts         # CLI demo for Calendar
├── gmail.ts           # CLI demo for Gmail
├── drive.ts           # CLI demo for Drive
├── app/
│   └── main.js        # Web app with OAuth
├── auth.ts            # OAuth utilities
├── auth-server.ts     # Standalone auth server
└── deno.json          # Task configuration
```

## API Reference

All three connectors use the same pattern with Groq's `/responses` endpoint:

```javascript
const response = await fetch("https://api.groq.com/openai/v1/responses", {
  method: "POST",
  headers: {
    "authorization": `Bearer ${GROQ_API_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "openai/gpt-oss-120b",
    tools: [{
      type: "mcp",
      server_label: "gmail",  // or "googlecalendar", "google"
      connector_id: "connector_gmail",
      authorization: googleToken,
      require_approval: "never",
    }],
    input: "your natural language query",
    stream: false,
  }),
});
```

## Examples

**Calendar:**
- "What meetings do I have this week?"
- "Am I free tomorrow afternoon?"

**Gmail:**
- "What was my last email from Groq?"
- "Show me unread emails from today"

**Drive:**
- "List files in my main folder"
- "Find documents modified this week"

## Learn More

- [Groq Documentation](https://console.groq.com/docs)
- [Google Calendar API](https://developers.google.com/calendar)
- [Gmail API](https://developers.google.com/gmail)
- [Google Drive API](https://developers.google.com/drive)

## Contributing

Contributions are welcome! Pull requests are encouraged. Please feel free to submit a PR for any improvements, bug fixes, or new features.

## License

Apache 2.0
