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
    console.log("[chat] Request body:", JSON.stringify(body, null, 2));
    const existingThreadId: string | null =
      typeof body?.threadId === "string" && body.threadId.length ? body.threadId : null;

    // Support either simple { message: string } or Vercel AI SDK-like { messages: [...] }
    let inputText = "";
    if (typeof body?.message === "string" && body.message.trim().length) {
      inputText = body.message.trim();
    } else if (Array.isArray(body?.messages) && body.messages.length) {
      const last = body.messages[body.messages.length - 1];
      // Try to resolve from different shapes
      inputText =
        last?.content?.[0]?.text?.value ??
        last?.content?.text?.value ??
        last?.content ??
        "";
    }
    console.log("[chat] Resolved inputText:", inputText);

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

    // 2) Prüfen, ob es überhaupt Text gibt
    if (!inputText) {
      return NextResponse.json(
        { error: "Es wurde kein Text übermittelt. Sende { message: string } oder ein messages-Array." },
        { status: 400 }
      );
    }

    // 3) Nutzer-Nachricht an Thread anhängen
    await client.beta.threads.messages.create(t.id, {
      role: "user",
      content: inputText,
    });

    // 4) Run starten (mit Chat-Assistant-ID)
    const run = await client.beta.threads.runs.create(t.id, {
      assistant_id: assistantId,
    });
    console.log("[chat] Using assistant_id:", assistantId, " thread:", t.id);

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
    console.log("[chat] Assistant reply:", text);

    return NextResponse.json({ threadId: t.id, reply: text });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[chat] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}