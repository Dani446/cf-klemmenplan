import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CF – Klemmenplan",
  description: "RI-Schema hinein, Klemmenbelegung heraus.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <Providers>
          <header className="bg-gray-800 text-white p-4">
            <nav className="container mx-auto flex gap-6">
              <Link href="/" className="hover:underline">
                Analyse
              </Link>
              <Link href="/chatbot" className="hover:underline">
                Chatbot
              </Link>
            </nav>
          </header>
          <main className="container mx-auto p-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}