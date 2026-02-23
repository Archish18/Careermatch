export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();

    // Convert Anthropic-style messages to OpenAI/Groq format
    const messages = [];

    if (body.system) {
      messages.push({ role: "system", content: body.system });
    }

    for (const msg of body.messages || []) {
      if (typeof msg.content === "string") {
        messages.push({ role: msg.role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const text = msg.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        if (text) messages.push({ role: msg.role, content: text });
      }
    }

    const groqBody = {
      model: "llama-3.3-70b-versatile",
      max_tokens: body.max_tokens || 1500,
      messages,
      temperature: 0.7,
    };

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(groqBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: { message: data.error?.message || `Groq error ${response.status}` }
      }), {
        status: response.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Convert Groq response → Anthropic-style so App.jsx needs no changes
    const text = data.choices?.[0]?.message?.content || "";
    const converted = {
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    };

    return new Response(JSON.stringify(converted), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: { message: e.message } }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}
