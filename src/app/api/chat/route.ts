export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { message, threadId } = (body ?? {}) as {
      message?: string;
      threadId?: string | null;
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Missing 'message'." }, { status: 400 });
    }

    // Thread anlegen/übernehmen
    let tid = typeof threadId === "string" && threadId.length ? threadId : null;
    if (!tid) {
      const t = await client.beta.threads.create({});
      tid = t.id;
    }

    // User-Message hinzufügen
    await client.beta.threads.messages.create(tid!, {
      role: "user",
      content: message,
    });

    // Run mit dem Q&A-Assistenten starten
    const run = await client.beta.threads.runs.create(tid!, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID_CHAT!,
    });

    // Warten bis abgeschlossen
    let tries = 0;
    while (tries < 120) {
      const r = await client.beta.threads.runs.retrieve(tid!, run.id);
      if (r.status === "completed") break;
      if (["failed", "cancelled", "expired"].includes(r.status ?? "")) {
        return NextResponse.json(
          { error: `Run status: ${r.status}`, threadId: tid },
          { status: 500 }
        );
      }
      await new Promise((res) => setTimeout(res, 1000));
      tries++;
    }

    // Antwort lesen
    const list = await client.beta.threads.messages.list(tid!, { limit: 15 });
    const lastAssistant = list.data.find((m) => m.role === "assistant");
    const reply =
      (lastAssistant?.content ?? [])
        .map((c: any) => (c.type === "text" ? c.text?.value ?? "" : ""))
        .join("\n\n")
        .trim() || "—";

    return NextResponse.json({ threadId: tid, reply });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST /api/chat." }, { status: 405 });
}