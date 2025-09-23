
"use client";
// Narrow ReactMarkdown type (optional dependency)
import React, { useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import * as XLSX from "xlsx";
import Markdown from "react-markdown";

type UploadedFile = { name: string; size: number; type?: string };
type Row = {
  signal: string;
  category: string;
  ioType: string;
  module: string;
  slot: string;
  terminal: string;
  voltage: string;
  cable: string;
  article: string;
  source: string;
};
type TableData = {
  controller?: string;
  assumptions?: string;
  rows: Row[];
};
type AnalysisResult = {
  received?: number;
  files?: UploadedFile[];
  threadId?: string;
  reply?: string;
  note?: string;
  table?: TableData;
} | { error: string };

// (Optional pretty markdown — run: npm i react-markdown)
// If react-markdown is not installed, the fallback <pre> will be used.
type MarkdownComponent = ((props: { children: string }) => React.ReactElement) | null;
const ReactMarkdown: MarkdownComponent = (props) => <Markdown {...props} />;

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function Page() {
  const { data: session, status } = useSession();
  const [files, setFiles] = useState<File[]>([]);
  // --- File helpers: add, dedupe, remove, clear ---
  const fileSignature = (f: File) => `${f.name}__${f.size}__${f.lastModified}`;
  function uniqueBySignature(list: File[]) {
    const seen = new Set<string>();
    const out: File[] = [];
    for (const f of list) {
      const sig = fileSignature(f);
      if (!seen.has(sig)) {
        seen.add(sig);
        out.push(f);
      }
    }
    return out;
  }
  function handleAddFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => uniqueBySignature([...prev, ...incoming]));
  }
  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }
  function clearFiles() {
    setFiles([]);
  }
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chat state
  const [threadId, setThreadId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [statusText, setStatusText] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [excelHref, setExcelHref] = useState<string | null>(null);
  const [excelName, setExcelName] = useState<string>("Klemmenbelegung.xlsx");

  // Scroll to download section when ready
  useEffect(() => {
    if (!excelHref) return;
    const el = document.getElementById("download-section");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [excelHref]);

  function copyToClipboard(text: string) {
    if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
  }

  async function analyze() {
    if (!files.length) return;
    setShowChat(false);
    setExcelHref(null);
    setIsUploading(true);
    setError(null);
    setResult(null);
    setStatusText("📤 Lade Dateien hoch & starte Analyse … das kann 30–90 Sekunden dauern.");
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      if (threadId) fd.append("threadId", threadId);

      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const payload: unknown = isJson ? await res.json() : await res.text();
      if (!res.ok) {
        const errMsg = isJson && typeof payload === "object" && payload !== null && "error" in (payload as Record<string, unknown>)
          ? String((payload as { error?: unknown }).error)
          : `HTTP ${res.status}${!isJson ? `: ${String(payload).slice(0,200)}` : ""}`;
        throw new Error(errMsg);
      }

      // Persist thread and surface note into chat
      if (typeof payload === "object" && payload !== null) {
        const d = payload as Partial<AnalysisResult>;
        if ("threadId" in d && d.threadId) setThreadId(d.threadId);
        if ("note" in d && typeof d.note === "string") {
          setMessages((m) => [...m, { role: "assistant", content: d.note as string }]);
        }
      }
      setResult(payload as AnalysisResult);

      if (typeof payload === "object" && payload !== null && "table" in (payload as Record<string, unknown>)) {
        const t = (payload as { table?: TableData }).table;
        setTableData(t ?? null);
        try {
          // Build downloadable Excel when a valid table exists
          if (t && Array.isArray(t.rows)) {
            const ws = XLSX.utils.json_to_sheet<Row>(t.rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Klemmenbelegung");

            // Create a Blob URL so user can download instead of seeing JSON
            const array = XLSX.write(wb, { bookType: "xlsx", type: "array" });
            const blob = new Blob([array], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

            // Revoke previous URL if any
            if (excelHref) URL.revokeObjectURL(excelHref);
            const url = URL.createObjectURL(blob);
            setExcelHref(url);

            // name: try to derive from first file; fallback keeps default
            const firstName = (typeof payload === "object" && payload !== null && Array.isArray((payload as { files?: UploadedFile[] }).files))
              ? ((payload as { files?: UploadedFile[] }).files?.[0]?.name)
              : undefined;
            if (firstName) setExcelName(`Klemmenbelegung_${String(firstName).replace(/\.[^/.]+$/, "")}.xlsx`);

            // Show chat only after we have a first assistant answer
            setShowChat(true);
          } else {
            setShowChat(false);
          }
        } catch {
          // ignore generation errors, UI will still show text status
        }
      } else {
        setTableData(null);
      }
      setStatusText("✅ Analyse abgeschlossen.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatusText("❌ Analyse fehlgeschlagen.");
    } finally {
      setIsUploading(false);
      setTimeout(() => setStatusText(null), 2500);
    }
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    setMessages((m) => [...m, userMsg]);
    setChatInput("");
    setChatLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: userMsg.content }),
      });
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const payload = isJson ? await res.json() : await res.text();
      if (!res.ok) {
        const errMsg = isJson
          ? (typeof payload === "object" && payload && "error" in payload
              ? String((payload as { error?: unknown }).error)
              : `HTTP ${res.status}`)
          : `HTTP ${res.status}: ${String(payload).slice(0, 200)}`;
        throw new Error(errMsg);
      }
      if (typeof payload === "object" && payload) {
        const d = payload as { threadId?: string; reply?: string };
        if (d.threadId) setThreadId(d.threadId);
        if (d.reply) setMessages((m) => [...m, { role: "assistant", content: d.reply as string }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: String(payload) }]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="container">
          <h1 className="hero__title">FIT‑OUT&nbsp;SERVICES<br/>für Kälte‑Regelanlagen</h1>
          <p className="hero__subtitle">RI‑Schema hinein, Klemmenbelegung heraus – schnell, konsistent, nachvollziehbar.</p>
        </div>
      </section>

      {/* PAGE CONTENT */}
<main className="container" style={{ padding: "28px 0 60px 0" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div />
          {status !== "authenticated" ? (
            <button className="btn btn--accent" onClick={() => signIn("azure-ad", { callbackUrl: "/" })}>Mit Microsoft anmelden</button>
          ) : (
            <button className="btn" onClick={() => signOut()}>Abmelden</button>
          )}
        </header>

        {status === "loading" && <p style={{ marginTop: 16 }}>Lade Sitzung…</p>}

        {status === "authenticated" ? (
          <section style={{ marginTop: 16 }}>
            <p>
              Angemeldet als <b>{session?.user?.email}</b>
            </p>

            <div className="layout-grid">
              {/* LEFT: Upload + Result */}
              <div className="grid-main" style={{ minWidth: 0 }}>
                {/* Upload-Box */}
                <div className="panel panel--card" style={{ marginTop: 16 }}>
                  <label style={{ display: "block", marginBottom: 8 }}>RI-/Dokument-Dateien hochladen (PDF/Bild):</label>
                  {/* Drag & Drop + Click to select */}
                  <div
                    className="upload-zone"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const dt = e.dataTransfer;
                      if (dt?.files?.length) handleAddFiles(dt.files);
                    }}
                  >
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      multiple
                      title="Dateien auswählen (Mehrfachauswahl möglich)"
                      onChange={(e) => handleAddFiles(e.target.files)}
                    />
                    <div className="upload-hint">
                      Dateien hierher ziehen oder klicken, um Dateien auszuwählen.
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button className="btn btn--accent" type="button" disabled={!files.length || isUploading} onClick={analyze}>
                      {isUploading ? "Analysiere…" : "Analysieren"}
                    </button>
                  </div>
                  {files.length > 0 && (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 13, opacity: 0.85 }}>
                          <b>{files.length}</b> Datei{files.length === 1 ? "" : "en"} ausgewählt
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn btn--ghost btn--sm"
                            type="button"
                            onClick={clearFiles}
                            title="Alle entfernen"
                            aria-label="Alle ausgewählten Dateien entfernen"
                          >
                            Alle entfernen
                          </button>
                        </div>
                      </div>

                      {/* Ausgewählte Dateien als Chips */}
                      <div className="chips">
                        {files.map((f, idx) => (
                          <span key={fileSignature(f)} className="chip" title={`${f.name} (${Math.round(f.size / 1024)} kB)`}>
                            <span className="chip__name">{f.name}</span>
                            <span className="chip__meta">({Math.round(f.size / 1024)} kB)</span>
                            <button className="chip__close" type="button" onClick={() => removeFile(idx)} aria-label={`Datei ${f.name} entfernen`}>×</button>
                          </span>
                        ))}
                      </div>

                      {/* Hinweis zur Mehrfachauswahl */}
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Tipp: Du kannst mehrere Dateien gleichzeitig auswählen (Strg/Cmd gedrückt halten) oder weitere Dateien später hinzufügen. Bereits ausgewählte Dateien bleiben erhalten.
                      </div>
                    </div>
                  )}
                  {statusText && (
                    <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
                      {statusText}
                    </div>
                  )}
                </div>

                {error ? (<p style={{ color: "#b00020", marginTop: 12 }}>Fehler: {error}</p>) : null}

                {result !== null && (
                  <div className="panel panel--card" style={{ marginTop: 16 }}>
                    <h3>Analyse-Ergebnis</h3>
                    <div className="hr" />

                    {/* Summary cards */}
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {typeof result === "object" && result !== null && !("error" in result) && typeof result.received === "number" && (
                        <div style={{ border: "1px solid #eee", padding: 10, borderRadius: 8 }}>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>Empfangene Dateien</div>
                          <div style={{ fontSize: 18, fontWeight: 600 }}>{result.received}</div>
                        </div>
                      )}
                      {typeof result === "object" && result !== null && !("error" in result) && result.threadId && (
                        <div style={{ border: "1px solid #eee", padding: 10, borderRadius: 8, maxWidth: 400 }}>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>Thread-ID</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <code style={{ fontSize: 12 }}>{result.threadId}</code>
                            <button
                              onClick={() => copyToClipboard(String(result.threadId))}
                              style={{ fontSize: 12 }}
                              title="In die Zwischenablage kopieren"
                            >
                              Kopieren
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* File badges */}
                    {(() => {
                      const filesArr = (typeof result === "object" && result !== null && !("error" in result) && Array.isArray(result.files))
                        ? result.files
                        : [];
                      return filesArr.length ? (
                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {filesArr.map((f, idx) => (
                            <span key={idx} className="badge">
                              {f.name} <span style={{ opacity: 0.6, fontSize: 12 }}>({Math.round((f.size || 0) / 1024)} kB)</span>
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}

                    {/* Excel Download block */}
                    {excelHref && (
                      <div id="download-section" style={{ marginTop: 12 }}>
                        <div className="download-card">
                          <div>
                            <div style={{ fontSize: 13, opacity: 0.7 }}>Ergebnis</div>
                            <div style={{ fontWeight: 700 }}>Klemmenbelegung als Excel</div>
                          </div>
                          <a className="btn btn--accent" href={excelHref} download={excelName}>
                            ⬇︎ Download&nbsp;({excelName})
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Structured table (from JSON) */}
                    {tableData && tableData.rows && Array.isArray(tableData.rows) && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Vorschau (gekürzt) – maßgeblich ist die Excel-Datei</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 13, opacity: 0.7 }}>Regler</div>
                            <div style={{ fontWeight: 600 }}>{tableData.controller || "–"}</div>
                          </div>
                        </div>

                        <div className="table-wrap" style={{ marginTop: 8 }}>
                          <table className="table">
                            <thead>
                              <tr>
                                {(["signal","category","ioType","module","slot","terminal","voltage","cable","article","source"] as (keyof Row)[]).map((h) => (
                                  <th key={h}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tableData.rows.map((r: Row, idx: number) => (
                                <tr key={idx}>
                                  {(["signal","category","ioType","module","slot","terminal","voltage","cable","article","source"] as (keyof Row)[]).map((k) => (
                                    <td key={k}>{r[k] ?? ""}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {tableData.assumptions && (
                          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                            Annahmen: {tableData.assumptions}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Assistant reply nicely rendered */}
                    {typeof result === "object" && result !== null && !("error" in result) && typeof result.reply === "string" && result.reply && (
                      <details style={{ marginTop: 14 }}>
                        <summary style={{ cursor: "pointer" }}>Erklärtext anzeigen (optional)</summary>
                        <div className="explain" style={{ marginTop: 10, padding: 12 }}>
                          {ReactMarkdown ? (
                            ReactMarkdown({ children: String(result.reply) })
                          ) : (
                            <pre style={{ whiteSpace: "pre-wrap" }}>{String(result.reply)}</pre>
                          )}
                        </div>
                      </details>
                    )}

                    {/* Raw JSON (collapsible) */}
                    <details style={{ marginTop: 12 }}>
                      <summary style={{ cursor: "pointer" }}>Debug‑Rohdaten anzeigen</summary>
                      <pre className="debug-pre" style={{ whiteSpace: "pre-wrap", padding: 12, borderRadius: 6 }}>
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>

              {/* RIGHT: Chat sidebar */}
              {showChat && (
                <aside className="panel panel--card chat-panel aside-sticky">
                  <h3 style={{ marginTop: 0 }}>Chat (optional)</h3>
                  <p style={{ margin: "6px 0 12px 0", opacity: 0.7, fontSize: 13 }}>
                    Für Nachfragen/Änderungen nach der ersten Klemmenbelegung.
                  </p>
                  <div className="chat-log">
                    {messages.length === 0 && (
                      <p style={{ opacity: 0.7 }}>
                        Frag z. B.: &quot;Ergänze die Tabelle um Kabelquerschnitte nach VDE&quot; oder &quot;Nutze CAREL pRack300T&quot;.
                      </p>
                    )}
                    {messages.map((m, i) => (
                      <div key={i} className={`msg ${m.role === "user" ? "msg--user" : "msg--assistant"}`}>
                        <b>{m.role === "user" ? "Du" : "Assistent"}:</b> {m.content}
                      </div>
                    ))}
                    {chatLoading && <div className="msg msg--assistant"><small>Assistent denkt…</small></div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Nachricht eingeben…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") sendChat();
                      }}
                    />
                    <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading}>
                      Senden
                    </button>
                  </div>
                  {threadId && <p style={{ marginTop: 8, opacity: 0.6, fontSize: 12 }}>Thread: {threadId}</p>}
                </aside>
              )}
            </div>
          </section>
        ) : (
          <p style={{ marginTop: 16 }}>Bitte zuerst anmelden.</p>
        )}
      </main>
      <a href="#"
         className="chat-fab"
         title="Chat öffnen"
         onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
        💬
      </a>
    </>
  );
}