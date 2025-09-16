import Providers from "./providers";
import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "CF – Klemmenplan",
  description: "Internes Tool zur Klemmenplan-Erstellung",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}