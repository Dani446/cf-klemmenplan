"use client";
import { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function Page() {
  const { data: session, status } = useSession();
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Chat state
  const [threadId, setThreadId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  async function analyze() {
    if (!files.length) return;
    setIsUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Unbekannter Fehler");
      setResult(data);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsUploading(false);
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
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Chat-Fehler");
      if (data.threadId) setThreadId(data.threadId);
      if (data.reply) setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>CF – Klemmenplan Generator</h1>
        {status !== "authenticated" ? (
          <button onClick={() => signIn("azure-ad", { callbackUrl: "/" })}>Mit Microsoft anmelden</button>
        ) : (
          <button onClick={() => signOut()}>Abmelden</button>
        )}
      </header>

      {status === "loading" && <p style={{ marginTop: 16 }}>Lade Sitzung…</p>}

      {status === "authenticated" ? (
        <section style={{ marginTop: 16 }}>
          <p>Angemeldet als <b>{session?.user?.email}</b></p>

          {/* Upload-Box */}
          <div style={{ marginTop: 16, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
            <label style={{ display: "block", marginBottom: 8 }}>RI-/Dokument-Datei hochladen (PDF/Bild):</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <div style={{ marginTop: 12 }}>
              <button disabled={!files.length || isUploading} onClick={analyze}>
                {isUploading ? "Analysiere…" : "Analysieren"}
              </button>
              {files.length > 0 && (
                <span style={{ marginLeft: 8, opacity: 0.7 }}>
                  {files.map((f) => f.name).join(", ")}
                </span>
              )}
            </div>
          </div>

          {error && (
            <p style={{ color: "#b00020", marginTop: 12 }}>Fehler: {error}</p>
          )}

          {result && (
            <div style={{ marginTop: 16 }}>
              <h3>Ergebnis (Demo)</h3>
              <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: 12, borderRadius: 6 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {/* Chat-Box */}
          <div style={{ marginTop: 24, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
            <h3 style={{ marginTop: 0 }}>Chat mit dem Assistenten</h3>
            <div style={{
              border: "1px solid #eee",
              borderRadius: 6,
              padding: 12,
              height: 240,
              overflowY: "auto",
              background: "#fafafa",
            }}>
              {messages.length === 0 && (
                <p style={{ opacity: 0.7 }}>Frag z. B.: "Welche Aktorik und Sensorik erkennst du im hochgeladenen RI-Schema?"</p>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <b>{m.role === "user" ? "Du" : "Assistent"}:</b> {m.content}
                </div>
              ))}
              {chatLoading && <p style={{ opacity: 0.7 }}>Assistent denkt…</p>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Nachricht eingeben…"
                style={{ flex: 1, padding: 8 }}
                onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
              />
              <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading}>Senden</button>
            </div>
            {threadId && (
              <p style={{ marginTop: 8, opacity: 0.6, fontSize: 12 }}>Thread: {threadId}</p>
            )}
          </div>
        </section>
      ) : (
        <p style={{ marginTop: 16 }}>Bitte zuerst anmelden.</p>
      )}
    </main>
  );
}