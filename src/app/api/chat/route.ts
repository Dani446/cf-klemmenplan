export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { threadId, message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message fehlt" }, { status: 400 });
    }

    let tId = threadId as string | undefined;
    if (!tId) {
      const t = await client.beta.threads.create({});
      tId = t.id;
    }

    await client.beta.threads.messages.create(tId!, { role: "user", content: message });

    const run = await client.beta.threads.runs.create(tId!, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID!,
    });

    let tries = 0;
    while (tries < 60) {
      const r = await client.beta.threads.runs.retrieve(tId!, run.id);
      if (r.status === "completed") break;
      if (["failed","cancelled","expired"].includes(r.status ?? "")) {
        return NextResponse.json({ error: `Run status: ${r.status}` }, { status: 500 });
      }
      await new Promise(res => setTimeout(res, 1000));
      tries++;
    }

    const list = await client.beta.threads.messages.list(tId!, { limit: 10 });
    const lastAssistant = list.data.find(m => m.role === "assistant");
    const parts = (lastAssistant?.content ?? []) as Array<{
      type: string;
      text?: { value?: string };
    }>;

    const reply =
      parts
        .map((c) => (c.type === "text" ? c.text?.value ?? null : null))
        .filter((val): val is string => Boolean(val))
        .join("\n\n") || "";

    return NextResponse.json({ threadId: tId, reply });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "GET not supported. Use POST /api/chat." }, { status: 405 });
}