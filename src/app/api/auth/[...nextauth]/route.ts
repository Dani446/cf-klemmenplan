import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    // Accept multiple files under the key "files"
    const items = form.getAll("files");
    const files: File[] = items.filter((i): i is File => i instanceof File);

    if (!files.length) {
      return NextResponse.json({ error: "Keine Dateien empfangen" }, { status: 400 });
    }

    // Optional: einfache Begrenzung, kann bei Bedarf erhöht werden
    const MAX_FILES = 50; // erlaubt 10+ bequem
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Zu viele Dateien: ${files.length}. Maximal erlaubt: ${MAX_FILES}.` },
        { status: 400 }
      );
    }

    // Echo-Metadaten zurück, um den Roundtrip zu verifizieren
    const summary = files.map((f) => ({ name: f.name, size: f.size, type: f.type }));

    return NextResponse.json({ received: files.length, files: summary, note: "Upload OK – OpenAI-Analyse folgt" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}