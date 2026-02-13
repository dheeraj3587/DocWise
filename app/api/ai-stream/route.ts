import { AzureOpenAI } from "openai";
import { NextRequest } from "next/server";

function getClient() {
  return new AzureOpenAI({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
  });
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, deep_mode } = await req.json();

    console.log("Received prompt, starting stream...", deep_mode ? "(deep mode)" : "(normal mode)");

    const client = getClient();
    const deployment = deep_mode
      ? (process.env.AZURE_OPENAI_DEEP_DEPLOYMENT || "gpt-5.2-chat")
      : (process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || "gpt-5-mini");

    const completion = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: "system", content: "You are DocWise, an intelligent document assistant. Format your responses using markdown for readability: use **bold** for key terms, bullet points for lists, ## headings for sections, and `code` for technical terms. Keep answers concise yet comprehensive." },
        { role: "user", content: prompt },
      ],
      stream: true,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          console.log("Stream started");

          for await (const chunk of completion) {
            const text = chunk.choices?.[0]?.delta?.content;
            if (text) {
              console.log("Chunk:", text);
              const data = JSON.stringify({ text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }

          console.log("Stream completed");
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error("API error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate response" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}