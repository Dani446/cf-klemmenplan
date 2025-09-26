// src/app/_components/RootClient.tsx
'use client';

import { useSearchParams } from "next/navigation";

export default function RootClient() {
  const sp = useSearchParams();
  const foo = sp.get("foo") ?? "";

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold">Root Client</h2>
      <p className="text-sm text-zinc-600">foo = {foo}</p>
    </div>
  );
}