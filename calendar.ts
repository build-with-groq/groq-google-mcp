// Minimal Groq + Google Calendar MCP example
// Uses Groq's /responses endpoint with MCP tools

import "jsr:@std/dotenv/load"; // needed for deno run; not req for smallweb or valtown

// Load environment variables
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const MCP_SERVER_LABEL = Deno.env.get("CALENDAR_SERVER_LABEL") || "googlecalendar";
const MCP_CONNECTOR_ID = Deno.env.get("CALENDAR_CONNECTOR_ID") || "connector_googlecalendar";
const GOOGLE_AUTHORIZATION = Deno.env.get("GOOGLE_AUTHORIZATION");
const USER_INPUT = Deno.env.get("CALENDAR_INPUT") || "whats on my schedule today";

if (!GROQ_API_KEY) {
  console.error("Error: GROQ_API_KEY is required in .env");
  Deno.exit(1);
}

if (!GOOGLE_AUTHORIZATION) {
  console.error("Error: GOOGLE_AUTHORIZATION is required in .env");
  Deno.exit(1);
}

// Make request to Groq's /responses endpoint
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
    input: USER_INPUT,
    stream: false,
  }),
});

if (!response.ok) {
  console.error("Error:", response.status, response.statusText);
  const errorText = await response.text();
  console.error("Response:", errorText);
  Deno.exit(1);
}

const data = await response.json();

// Extract the final message from the output array
function getFinalMessage(data: any): string {
  const output = data.output || [];
  // Find the last message item in the output
  const messages = output.filter((item: any) => item.type === "message");
  if (messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage.content || [];
    // Get the text from output_text items
    const textContent = content
      .filter((c: any) => c.type === "output_text")
      .map((c: any) => c.text)
      .join("\n");
    return textContent;
  }
  return "No message found in response";
}

const finalAnswer = getFinalMessage(data);

console.log(finalAnswer);

