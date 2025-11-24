import { Hono } from 'https://deno.land/x/hono@v3.11.12/mod.ts';
import "jsr:@std/dotenv/load"; // needed for deno run; not req for smallweb or valtown

const app = new Hono();

// Extract the final message from Groq response
function getFinalMessage(data) {
  const output = data.output || [];
  const messages = output.filter((item) => item.type === "message");
  if (messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage.content || [];
    const textContent = content
      .filter((c) => c.type === "output_text")
      .map((c) => c.text)
      .join("\n");
    return textContent;
  }
  return "No message found in response";
}

// JSON Schemas for Structured Outputs
const calendarEventsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      time: { type: "string" },
      link: { type: ["string", "null"] }
    },
    required: ["id", "title", "time"],
    additionalProperties: false
  }
};

const gmailEmailsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: ["string", "null"] },
      from: { type: "string" },
      subject: { type: "string" },
      snippet: { type: "string" },
      link: { type: ["string", "null"] }
    },
    required: ["from", "subject", "snippet"],
    additionalProperties: false
  }
};

const driveFilesSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      type: { type: "string" },
      link: { type: ["string", "null"] }
    },
    required: ["id", "name", "type"],
    additionalProperties: false
  }
};

// Read HTML file
const htmlContent = await Deno.readTextFile(new URL('./index.html', import.meta.url));

// OAuth routes
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

// Start OAuth flow
app.get('/auth', (c) => {
  if (!CLIENT_ID) {
    return c.html('<html><body><h1>Error</h1><p>GOOGLE_CLIENT_ID is required in environment variables</p></body></html>', 500);
  }
  
  const scopes = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.readonly",
  ].join(" ");

  // Get the origin from the request URL
  const url = new URL(c.req.url);
  const redirectUri = `${url.origin}/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return c.redirect(authUrl.toString());
});

// OAuth callback
app.get('/callback', async (c) => {
  const code = c.req.query("code");

  if (!code) {
    return c.html('<html><body><h1>Authentication Failed</h1><p>No authorization code received</p><p><a href="/">Go back</a></p></body></html>', 400);
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return c.html('<html><body><h1>Error</h1><p>GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required</p></body></html>', 500);
  }

  try {
    // Get the origin from the request URL
    const url = new URL(c.req.url);
    const redirectUri = `${url.origin}/callback`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return c.html(`<html><body><h1>Authentication Failed</h1><p>Token exchange failed: ${errorText}</p><p><a href="/">Go back</a></p></body></html>`, 400);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Return page that stores token in localStorage and redirects
    return c.html(`<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <style>
    body { font-family: system-ui; padding: 2rem; text-align: center; }
    .success { color: #28a745; font-size: 1.2rem; margin: 2rem 0; }
  </style>
</head>
<body>
  <h1>✅ Authentication Successful!</h1>
  <p class="success">Redirecting...</p>
  <script>
    localStorage.setItem('google_token', '${accessToken}');
    localStorage.setItem('google_login_time', Date.now().toString());
    window.location.href = '/';
  </script>
</body>
</html>`);
  } catch (err) {
    return c.html(`<html><body><h1>Error</h1><p>${err.message}</p><p><a href="/">Go back</a></p></body></html>`, 500);
  }
});

// Serve root with HTML content
app.get('/', (c) => {
  return c.html(htmlContent);
});

// Calendar API endpoint
app.post('/api/calendar', async (c) => {
  try {
    const { input, token } = await c.req.json();
    
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const MCP_SERVER_LABEL = Deno.env.get("CALENDAR_SERVER_LABEL") || "googlecalendar";
    const MCP_CONNECTOR_ID = Deno.env.get("CALENDAR_CONNECTOR_ID") || "connector_googlecalendar";
    const GOOGLE_AUTHORIZATION = token;
    
    if (!GROQ_API_KEY) {
      return c.json({ error: 'GROQ_API_KEY is required' }, 400);
    }
    
    if (!GOOGLE_AUTHORIZATION) {
      return c.json({ error: 'Please login with Google first' }, 400);
    }
    
    // Add instruction to avoid tables and use plain text only
    const enhancedInput = input + "\n\nIMPORTANT: Respond with plain text only. Do not use markdown tables. Use simple text formatting like bullet points or numbered lists instead.";
    
    const response = await fetch("https://api.groq.com/openai/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        tools: [
          {
            type: "mcp",
            server_label: MCP_SERVER_LABEL,
            connector_id: MCP_CONNECTOR_ID,
            authorization: GOOGLE_AUTHORIZATION,
            require_approval: "never",
          },
        ],
        input: enhancedInput,
        stream: false,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails = errorText;
      
      // Try to parse as JSON to get structured error
      try {
        const errorJson = JSON.parse(errorText);
        // If it's a structured error object, return it properly
        if (errorJson.error) {
          errorDetails = JSON.stringify(errorJson, null, 2);
        } else {
          errorDetails = JSON.stringify(errorJson, null, 2);
        }
      } catch (e) {
        // Not JSON, use text as-is
        errorDetails = errorText;
      }
      
      console.error('Groq API error:', response.status, errorDetails);
      return c.json({ 
        error: `Groq API error (${response.status}): ${errorDetails}`,
        errorDetails: errorDetails,
        status: response.status
      }, response.status >= 500 ? 500 : response.status);
    }
    
    const data = await response.json();
    const result = getFinalMessage(data);
    
    return c.json({ result });
  } catch (error) {
    console.error('Calendar API error:', error);
    return c.json({ error: 'Server error: ' + error.message }, 500);
  }
});

// Gmail API endpoint
app.post('/api/gmail', async (c) => {
  try {
    const { input, token } = await c.req.json();
    
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const MCP_SERVER_LABEL = Deno.env.get("GMAIL_SERVER_LABEL") || "gmail";
    const MCP_CONNECTOR_ID = Deno.env.get("GMAIL_CONNECTOR_ID") || "connector_gmail";
    const GOOGLE_AUTHORIZATION = token;
    
    if (!GROQ_API_KEY) {
      return c.json({ error: 'GROQ_API_KEY is required' }, 400);
    }
    
    if (!GOOGLE_AUTHORIZATION) {
      return c.json({ error: 'Please login with Google first' }, 400);
    }
    
    // Add instruction to avoid tables and use plain text only
    const enhancedInput = input + "\n\nIMPORTANT: Respond with plain text only. Do not use markdown tables. Use simple text formatting like bullet points or numbered lists instead.";
    
    const response = await fetch("https://api.groq.com/openai/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        tools: [
          {
            type: "mcp",
            server_label: MCP_SERVER_LABEL,
            connector_id: MCP_CONNECTOR_ID,
            authorization: GOOGLE_AUTHORIZATION,
            require_approval: "never",
          },
        ],
        input: enhancedInput,
        stream: false,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails = errorText;
      
      // Try to parse as JSON to get structured error
      try {
        const errorJson = JSON.parse(errorText);
        // If it's a structured error object, return it properly
        if (errorJson.error) {
          errorDetails = JSON.stringify(errorJson, null, 2);
        } else {
          errorDetails = JSON.stringify(errorJson, null, 2);
        }
      } catch (e) {
        // Not JSON, use text as-is
        errorDetails = errorText;
      }
      
      console.error('Groq API error:', response.status, errorDetails);
      return c.json({ 
        error: `Groq API error (${response.status}): ${errorDetails}`,
        errorDetails: errorDetails,
        status: response.status
      }, response.status >= 500 ? 500 : response.status);
    }
    
    const data = await response.json();
    console.log('Gmail API - Raw Groq response:', JSON.stringify(data, null, 2));
    const result = getFinalMessage(data);
    console.log('Gmail API - Extracted result:', result);
    
    return c.json({ result });
  } catch (error) {
    console.error('Gmail API error:', error);
    return c.json({ error: 'Server error: ' + error.message }, 500);
  }
});

// Drive API endpoint
app.post('/api/drive', async (c) => {
  try {
    const { input, token } = await c.req.json();
    
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const MCP_SERVER_LABEL = Deno.env.get("DRIVE_SERVER_LABEL") || "google";
    const MCP_CONNECTOR_ID = Deno.env.get("DRIVE_CONNECTOR_ID") || "connector_googledrive";
    const GOOGLE_AUTHORIZATION = token;
    
    if (!GROQ_API_KEY) {
      return c.json({ error: 'GROQ_API_KEY is required' }, 400);
    }
    
    if (!GOOGLE_AUTHORIZATION) {
      return c.json({ error: 'Please login with Google first' }, 400);
    }
    
    // Add instruction to avoid tables and use plain text only
    const enhancedInput = input + "\n\nIMPORTANT: Respond with plain text only. Do not use markdown tables. Use simple text formatting like bullet points or numbered lists instead.";
    
    const response = await fetch("https://api.groq.com/openai/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        tools: [
          {
            type: "mcp",
            server_label: MCP_SERVER_LABEL,
            connector_id: MCP_CONNECTOR_ID,
            authorization: GOOGLE_AUTHORIZATION,
            require_approval: "never",
          },
        ],
        input: enhancedInput,
        stream: false,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails = errorText;
      
      // Try to parse as JSON to get structured error
      try {
        const errorJson = JSON.parse(errorText);
        // If it's a structured error object, return it properly
        if (errorJson.error) {
          errorDetails = JSON.stringify(errorJson, null, 2);
        } else {
          errorDetails = JSON.stringify(errorJson, null, 2);
        }
      } catch (e) {
        // Not JSON, use text as-is
        errorDetails = errorText;
      }
      
      console.error('Groq API error:', response.status, errorDetails);
      return c.json({ 
        error: `Groq API error (${response.status}): ${errorDetails}`,
        errorDetails: errorDetails,
        status: response.status
      }, response.status >= 500 ? 500 : response.status);
    }
    
    const data = await response.json();
    const result = getFinalMessage(data);
    
    return c.json({ result });
  } catch (error) {
    console.error('Drive API error:', error);
    return c.json({ error: 'Server error: ' + error.message }, 500);
  }
});

// Omni API endpoint
app.post('/api/omni', async (c) => {
  try {
    const { input, token } = await c.req.json();
    
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const GOOGLE_AUTHORIZATION = token;
    
    // Get all connector configs
    const CALENDAR_SERVER = Deno.env.get("CALENDAR_SERVER_LABEL") || "googlecalendar";
    const CALENDAR_ID = Deno.env.get("CALENDAR_CONNECTOR_ID") || "connector_googlecalendar";
    
    const GMAIL_SERVER = Deno.env.get("GMAIL_SERVER_LABEL") || "gmail";
    const GMAIL_ID = Deno.env.get("GMAIL_CONNECTOR_ID") || "connector_gmail";
    
    const DRIVE_SERVER = Deno.env.get("DRIVE_SERVER_LABEL") || "google";
    const DRIVE_ID = Deno.env.get("DRIVE_CONNECTOR_ID") || "connector_googledrive";
    
    if (!GROQ_API_KEY) {
      return c.json({ error: 'GROQ_API_KEY is required' }, 400);
    }
    
    if (!GOOGLE_AUTHORIZATION) {
      return c.json({ error: 'Please login with Google first' }, 400);
    }
    
    // Add instruction to avoid tables and use plain text only
    const enhancedInput = input + "\n\nIMPORTANT: Respond with plain text only. Do not use markdown tables. Use simple text formatting like bullet points or numbered lists instead.";
    
    const response = await fetch("https://api.groq.com/openai/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        tools: [
          {
            type: "mcp",
            server_label: CALENDAR_SERVER,
            connector_id: CALENDAR_ID,
            authorization: GOOGLE_AUTHORIZATION,
            require_approval: "never",
          },
          {
            type: "mcp",
            server_label: GMAIL_SERVER,
            connector_id: GMAIL_ID,
            authorization: GOOGLE_AUTHORIZATION,
            require_approval: "never",
          },
          {
            type: "mcp",
            server_label: DRIVE_SERVER,
            connector_id: DRIVE_ID,
            authorization: GOOGLE_AUTHORIZATION,
            require_approval: "never",
          },
        ],
        input: enhancedInput,
        stream: false,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails = errorText;
      
      // Try to parse as JSON to get structured error
      try {
        const errorJson = JSON.parse(errorText);
        // If it's a structured error object, return it properly
        if (errorJson.error) {
          errorDetails = JSON.stringify(errorJson, null, 2);
        } else {
          errorDetails = JSON.stringify(errorJson, null, 2);
        }
      } catch (e) {
        // Not JSON, use text as-is
        errorDetails = errorText;
      }
      
      console.error('Groq API error:', response.status, errorDetails);
      return c.json({ 
        error: `Groq API error (${response.status}): ${errorDetails}`,
        errorDetails: errorDetails,
        status: response.status
      }, response.status >= 500 ? 500 : response.status);
    }
    
    const data = await response.json();
    const result = getFinalMessage(data);
    
    return c.json({ result });
  } catch (error) {
    console.error('Omni API error:', error);
    return c.json({ error: 'Server error: ' + error.message }, 500);
  }
});


// Export app.fetch for Val Town, otherwise export app — this is only for hono apps
export default (typeof Deno !== "undefined" && Deno.env.get("valtown")) ? app.fetch : app;