// src/app/api/chat/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  // Fail fast at request-time (not build-time)
  console.warn("[chat] OPENAI_API_KEY is not set");
}

const client = new OpenAI({ apiKey: apiKey || "" });

export async function POST(req: Request) {
  try {
    // Client darf KEINE Assistant-ID mehr schicken; wir wählen serverseitig die Chat-ID
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const existingThreadId: string | null =
      typeof body?.threadId === "string" && body.threadId.length ? body.threadId : null;

    const assistantId = process.env.OPENAI_ASSISTANT_ID_CHAT;
    if (!assistantId) {
      return NextResponse.json(
        { error: "OPENAI_ASSISTANT_ID_CHAT ist nicht gesetzt." },
        { status: 500 }
      );
    }
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY ist nicht gesetzt." },
        { status: 500 }
      );
    }

    // 1) Thread anlegen/weiterverwenden
    const t = existingThreadId
      ? { id: existingThreadId }
      : await client.beta.threads.create({});

    // 2) Letzte User-Nachricht ermitteln (Fallback: 'Frage')
    const lastUserContent =
      messages?.[messages.length - 1]?.content ??
      "Frage";

    // 3) Nutzer-Nachricht an Thread anhängen
    await client.beta.threads.messages.create(t.id, {
      role: "user",
      content: String(lastUserContent),
    });

    // 4) Run starten (mit Chat-Assistant-ID)
    const run = await client.beta.threads.runs.create(t.id, {
      assistant_id: assistantId,
    });

    // 5) Polling bis abgeschlossen/Fehler
    let tries = 0;
    while (tries < 120) {
      const r = await client.beta.threads.runs.retrieve(t.id, run.id);
      if (r.status === "completed") break;
      if (["failed", "cancelled", "expired"].includes(r.status ?? "")) {
        return NextResponse.json({ error: `Run status: ${r.status}` }, { status: 500 });
      }
      await new Promise((res) => setTimeout(res, 1000));
      tries++;
    }

    // 6) Letzte Assistenten-Antwort holen (Textteile zusammensetzen)
    const list = await client.beta.threads.messages.list(t.id, { limit: 15 });
    const lastAssistant = list.data.find((m) => m.role === "assistant");
    const text =
      lastAssistant?.content
        ?.map((c: any) => (c.type === "text" ? c.text?.value : null))
        .filter(Boolean)
        .join("\n\n") ?? "";

    return NextResponse.json({ threadId: t.id, reply: text });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[chat] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}