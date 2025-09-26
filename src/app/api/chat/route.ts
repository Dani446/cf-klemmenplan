export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { MessageContent } from "openai/resources/beta/threads/messages";

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY fehlt (lokal: .env.local setzen; Vercel: Project → Settings → Environment Variables)."
    );
  }
  return new OpenAI({ apiKey: key });
}

interface ChatPostBody {
  threadId?: string | null;
  message: string;
  assistantId?: string | null; // optional: alternate assistant per request
}

function resolveAssistantId(reqBody: ChatPostBody): string {
  const fromBody = (reqBody.assistantId || "").trim();
  const env1 = (process.env.OPENAI_ASSISTANT_ID || "").trim();
  const env2 = (process.env.OPENAI_ASSISTANT_ID_CHAT || "").trim();
  const env3 = (process.env.NEXT_PUBLIC_ASSISTANT_ID_CHAT || "").trim();
  const id = fromBody || env1 || env2 || env3;
  if (!id) throw new Error("Assistant-ID fehlt. Setze OPENAI_ASSISTANT_ID oder reiche assistantId im Body mit.");
  return id;
}

export async function POST(req: Request) {
  try {
    const client = getOpenAI();
    const body = (await req.json()) as ChatPostBody;
    const userMsg = (body?.message || "").trim();
    if (!userMsg) return NextResponse.json({ error: "message fehlt" }, { status: 400 });

    const assistantId = resolveAssistantId(body);

    let threadId = (body.threadId || "").trim() || null;
    if (!threadId) {
      const t = await client.beta.threads.create({});
      threadId = t.id;
    }

    await client.beta.threads.messages.create(threadId, { role: "user", content: userMsg });

    const run = await client.beta.threads.runs.create(threadId, { assistant_id: assistantId });

    // poll until completed (max ~2min)
    let tries = 0;
    while (tries < 120) {
      const r = await client.beta.threads.runs.retrieve(threadId, run.id);
      if (r.status === "completed") break;
      if (["failed", "cancelled", "expired"].includes(r.status ?? "")) {
        return NextResponse.json({ error: `Run status: ${r.status}` }, { status: 500 });
      }
      await new Promise((res) => setTimeout(res, 1000));
      tries++;
    }

    const list = await client.beta.threads.messages.list(threadId, { limit: 10 });
    const lastAssistant = list.data.find((m) => m.role === "assistant");
    const parts = (lastAssistant?.content ?? []) as MessageContent[];
    const reply =
      parts
        .map((c) => (c.type === "text" ? c.text?.value ?? null : null))
        .filter((v): v is string => Boolean(v))
        .join("\n\n") || "(Keine Text-Antwort erhalten)";

    return NextResponse.json({ threadId, reply });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}