"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const { data: session, status } = useSession();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  if (status === "loading") {
    return <div className="container mx-auto p-6 text-sm opacity-70">Lade…</div>;
  }

  if (!session) {
    return (
      <div className="container mx-auto p-6">
        <div className="rounded-lg bg-neutral-900/40 border border-white/10 p-6 max-w-xl">
          <h1 className="text-2xl font-semibold mb-2">Chat (zugangsbeschränkt)</h1>
          <p className="opacity-80 mb-4">Bitte melde dich an, um den Chat zu nutzen.</p>
          <button
            onClick={() => signIn("azure-ad")}
            className="px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white"
          >
            Anmelden
          </button>
        </div>
      </div>
    );
  }

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setLoading(true);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, threadId }),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || "Unbekannter Fehler.";
        setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${msg}` }]);
      } else {
        if (data.threadId && data.threadId !== threadId) setThreadId(data.threadId as string);
        const reply = typeof data.reply === "string" ? data.reply : "";
        setMessages((m) => [...m, { role: "assistant", content: reply || "—" }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "⚠️ Netzwerkfehler." }]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Chat</h1>
        <p className="opacity-70">Klassisches Frage–Antwort-Spiel mit dem zweiten Assistant.</p>
      </div>

      <div className="grid gap-4 max-w-3xl">
        <div className="rounded-lg border border-white/10 bg-neutral-900/40 p-4">
          <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <p className="opacity-60 text-sm">Stelle deine erste Frage…</p>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-white" : "text-orange-300"}>
                  <span className="inline-block px-2 py-0.5 text-xs rounded border border-white/10 mr-2 opacity-80">
                    {m.role === "user" ? "Du" : "Assistent"}
                  </span>
                  <span className="align-middle whitespace-pre-wrap">{m.content}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-neutral-900/40 p-4">
          <label className="block text-sm opacity-80 mb-2">Nachricht</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            placeholder="Frage eingeben… ⌘/Ctrl + Enter zum Senden"
            className="w-full bg-neutral-950/60 border border-white/10 rounded-md p-3 outline-none focus:ring-2 focus:ring-orange-500/40"
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={send}
              disabled={loading}
              className="px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Sende…" : "Senden"}
            </button>
            {threadId ? (
              <span className="text-xs opacity-60">Thread: {threadId}</span>
            ) : (
              <span className="text-xs opacity-60">Neuer Thread wird beim Senden erzeugt</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}