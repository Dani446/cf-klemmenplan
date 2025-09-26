// src/app/chat/page.tsx
'use client';

import { Suspense, useState } from "react";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (loading) return;
    const text = input.trim();
    if (!text) return;

    setErr(null);
    const userMsg = { role: "user" as const, content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Wichtig: KEINE assistantId vom Client schicken – Server wählt CHAT-Assistant!
        body: JSON.stringify({
          messages: [...messages, userMsg],
          threadId,
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data?.reply) {
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      }
      if (data?.threadId) setThreadId(data.threadId);
    } catch (e: any) {
      setErr(e?.message || "Fehler beim Senden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Lade…</div>}>
      <div className="mx-auto max-w-3xl p-6 space-y-6">
        <h1 className="text-xl font-semibold">Chat (Assistant: CHAT)</h1>

        {err && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <span className="inline-block rounded-lg border px-3 py-2">
                <strong className="mr-2">{m.role}:</strong>{m.content}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="Deine Nachricht…"
            className="flex-1 rounded border px-3 py-2"
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={loading}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? "Sende…" : "Senden"}
          </button>
        </div>

        {threadId && (
          <div className="text-xs text-zinc-500">
            Thread: <span className="font-mono">{threadId}</span>
          </div>
        )}
      </div>
    </Suspense>
  );
}