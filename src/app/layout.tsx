import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "CF – Klemmenplan",
  description: "RI-Schema hinein, Klemmenbelegung heraus.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // WICHTIG: layout.tsx bleibt Server Component (kein "use client").
  // Den clientseitigen Provider mounten wir hier drinnen.
  return (
    <html lang="de">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}