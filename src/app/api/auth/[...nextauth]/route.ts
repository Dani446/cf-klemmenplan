/* eslint-disable @typescript-eslint/no-explicit-any */
import NextAuth, { type NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

const {
  NEXTAUTH_SECRET,
  NEXTAUTH_URL,
  AZURE_AD_CLIENT_ID,
  AZURE_AD_CLIENT_SECRET,
  AZURE_AD_TENANT_ID,
  ALLOWED_EMAIL_DOMAIN,
} = process.env;

// Hilfreiches Logging bei fehlender Konfiguration (zeigt sich in Vercel Logs)
if (!NEXTAUTH_SECRET) console.error("[auth] NEXTAUTH_SECRET fehlt!");
if (!AZURE_AD_CLIENT_ID) console.error("[auth] AZURE_AD_CLIENT_ID fehlt!");
if (!AZURE_AD_CLIENT_SECRET) console.error("[auth] AZURE_AD_CLIENT_SECRET fehlt!");
if (!AZURE_AD_TENANT_ID) console.error("[auth] AZURE_AD_TENANT_ID fehlt!");
if (!NEXTAUTH_URL) console.warn("[auth] NEXTAUTH_URL ist nicht gesetzt (Vercel setzt sie i.d.R. automatisch).");

export const authOptions: NextAuthOptions = {
  secret: NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  // wichtig: issuer explizit setzen – passt zum /api/auth/callback/azure-ad
  providers: [
    AzureADProvider({
      clientId: AZURE_AD_CLIENT_ID!,
      clientSecret: AZURE_AD_CLIENT_SECRET!,
      tenantId: AZURE_AD_TENANT_ID!,
      issuer: `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/v2.0`,
      authorization: { params: { scope: "openid profile email" } },
      // (Optional) explizit: checks
      // checks: ["pkce", "state"],
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const domain = ALLOWED_EMAIL_DOMAIN?.toLowerCase();
      const email = user?.email?.toLowerCase() ?? "";
      return domain ? email.endsWith(`@${domain}`) : true;
    },
    async jwt({ token, account, profile }) {
      if (account) token.provider = account.provider;
      // Email sicher mappen (manche Tenants liefern nur preferred_username)
      const email =
        (profile as Record<string, unknown>)?.["email"] ||
        (profile as Record<string, unknown>)?.["preferred_username"];
      if (typeof email === "string") token.email = email;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.email === "string") {
        session.user.email = token.email;
      }
      return session;
    },
  },
  // Sorgt dafür, dass Fehler ins JSON-Log gehen statt „weißer Seite“
  pages: {
    error: "/api/auth/error",
  },
  // Bei App Router nicht zwingend, schadet aber nicht:
  debug: process.env.NODE_ENV !== "production",
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };