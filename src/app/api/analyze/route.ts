export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import type { MessageContent } from "openai/resources/beta/threads/messages";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Data model for the JSON we expect from the assistant */
export interface KlemmenRow {
  signal: string;
  category: "Sensor" | "Aktor" | "Verbraucher";
  ioType: "DI" | "DO" | "AI" | "AO" | "PWM" | "COM";
  module: string;
  slot: string;
  terminal: string;
  voltage: string;
  cable: string;
  article: string;
  source: string;
}
export interface KlemmenTable {
  controller: "Carel" | "Danfoss" | "Wurm";
  assumptions: string;
  rows: KlemmenRow[];
}

/** Extract first JSON code block (```json ... ```) or best‑effort JSON substring, validated against KlemmenTable shape */
function extractJSON(text: string): KlemmenTable | null {
  const tryParse = (raw: string): KlemmenTable | null => {
    try {
      const obj = JSON.parse(raw) as unknown;

      // Runtime shape check (minimal)
      if (
        obj &&
        typeof obj === "object" &&
        "controller" in obj &&
        "rows" in obj &&
        Array.isArray((obj as { rows: unknown }).rows)
      ) {
        const tbl = obj as KlemmenTable;
        return tbl;
      }
      return null;
    } catch {
      return null;
    }
  };

  // fenced block first
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence?.[1]) {
    const parsed = tryParse(fence[1]);
    if (parsed) return parsed;
  }

  // fallback whole text
  return tryParse(text);
}

export async function POST(req: Request) {
  try {
    console.log("[analyze] start");
    const form = await req.formData();

    const maybeThread = form.get("threadId");
    const existingThreadId =
      typeof maybeThread === "string" && maybeThread.length ? maybeThread : null;

    const items = form.getAll("files");
    const files: File[] = items.filter((i): i is File => i instanceof File);
    console.log("[analyze] files:", files.map((f) => `${f.name} (${f.size})`));

    if (!files.length) {
      return NextResponse.json({ error: "Keine Dateien empfangen" }, { status: 400 });
    }

    // 1) Thread anlegen oder übernehmen
    let threadId = existingThreadId;
    if (!threadId) {
      const t = await client.beta.threads.create({});
      threadId = t.id;
    }
    console.log("[analyze] threadId:", threadId);

    // 2) Dateien zu OpenAI hochladen (purpose: assistants)
    console.log("[analyze] upload files start");
    const uploadedIds = await Promise.all(
      files.map(async (f) => {
        const buf = Buffer.from(await f.arrayBuffer());
        const up = await client.files.create({
          file: await toFile(buf, f.name, { type: f.type || "application/octet-stream" }),
          purpose: "assistants",
        });
        return up.id;
      })
    );
    console.log("[analyze] uploaded fileIds:", uploadedIds);

    // 3) User-Message mit Attachments (file_search) in den Thread schreiben – inkl. strikter JSON-Anweisung
    const jsonSchema = `
Gib die Klemmenbelegung **zuerst als JSON** zurück, mit exakt dieser Struktur (keine zusätzlichen Felder):
{
  "controller": "Carel|Danfoss|Wurm",
  "assumptions": "kurzer Hinweistext",
  "rows": [
    {
      "signal": "z.B. Saugdrucksensor",
      "category": "Sensor|Aktor|Verbraucher",
      "ioType": "DI|DO|AI|AO|PWM|COM",
      "module": "z.B. CAREL I/O-Expander 8DI/8DO",
      "slot": "z.B. Klemmenblock/Modul-Slot",
      "terminal": "z.B. DI1 / DO3 / AI2 etc.",
      "voltage": "z.B. 24V AC/DC",
      "cable": "empfohlener Kabeltyp/Querschnitt",
      "article": "Artikelnummer/Typ, falls vorhanden",
      "source": "Fundstelle: Datei + Seite/Position"
    }
  ]
}
**WICHTIG:** Die JSON-Ausgabe MUSS in einem einzigen \`\`\`json Codeblock stehen. Danach (optional) eine knappe Markdown-Zusammenfassung.`;

    await client.beta.threads.messages.create(threadId!, {
      role: "user",
      content:
        "Analysiere die hochgeladenen RI-/Dokumente und erstelle eine Klemmenbelegung.\n" +
        "1) Erkenne Aktorik, Sensorik und elektrische Verbraucher.\n" +
        "2) Bestimme notwendige Zusatzmodule für den vorgegebenen Verbundregler.\n" +
        "3) Gib zuerst die Klemmenbelegung **als JSON** im geforderten Schema zurück.\n" +
        jsonSchema,
      attachments: uploadedIds.map((id) => ({
        file_id: id,
        tools: [{ type: "file_search" as const }],
      })),
    });

    // 4) Run starten (ohne tool_resources – Dateien hängen bereits an der Message)
    console.log("[analyze] run start");
    // resolve assistant id for analyze endpoint
    const assistantId = process.env.OPENAI_ASSISTANT_ID_ANALYZE;
    if (!assistantId) {
      console.error("[analyze] missing env OPENAI_ASSISTANT_ID_ANALYZE");
      return NextResponse.json(
        { error: "Server misconfigured: OPENAI_ASSISTANT_ID_ANALYZE is not set." },
        { status: 500 }
      );
    }
    const run = await client.beta.threads.runs.create(threadId!, {
      assistant_id: assistantId,
    });

    // 5) Polling, bis abgeschlossen
    let tries = 0;
    while (tries < 120) {
      const r = await client.beta.threads.runs.retrieve(threadId!, run.id);
      if (r.status === "completed") {
        console.log("[analyze] run completed");
        break;
      }
      if (["failed", "cancelled", "expired"].includes(r.status ?? "")) {
        console.error("[analyze] run failed:", r.status);
        return NextResponse.json({ error: `Run status: ${r.status}` }, { status: 500 });
      }
      await new Promise((res) => setTimeout(res, 1000));
      tries++;
      if (tries % 10 === 0) console.log(`[analyze] polling… ${tries}s`);
    }

    // 6) Letzte Assistenten-Antwort holen
    const list = await client.beta.threads.messages.list(threadId!, { limit: 15 });
    const lastAssistant = list.data.find((m) => m.role === "assistant");
    const parts = (lastAssistant?.content ?? []) as MessageContent[];
    const reply =
      parts
        .map((c) => (c.type === "text" ? c.text?.value ?? null : null))
        .filter((v): v is string => Boolean(v))
        .join("\n\n") || "Analyse abgeschlossen – kein Textinhalt gefunden.";

    // 7) JSON-Tabelle extrahieren
    const table = extractJSON(reply);

    const summary = files.map((f) => ({ name: f.name, size: f.size, type: f.type }));
    console.log("[analyze] done, returning JSON");

    return NextResponse.json({
      received: files.length,
      files: summary,
      threadId,
      reply,
      table, // kann null sein, wenn der Assistent keinen JSON-Block geliefert hat
      note: table
        ? "JSON-Tabelle erkannt und mitgeliefert."
        : "Hinweis: JSON-Tabelle nicht erkannt. Du kannst sie im Chat nachfordern: 'Gib die Klemmenbelegung nur als JSON gemäß Schema aus.'",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[analyze] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "GET not supported. Use POST /api/analyze." }, { status: 405 });
}