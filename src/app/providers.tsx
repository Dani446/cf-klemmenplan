/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { SessionProvider } from "next-auth/react";
import React from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  // Client-Komponente: stellt den Next-Auth React Context bereit,
  // damit useSession() in deinen Client-Seiten funktioniert.
  return <SessionProvider>{children}</SessionProvider>;
}