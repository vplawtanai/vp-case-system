import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { AppLocaleProvider } from "../lib/i18n/provider";
import { resolvePreferredLocale, UI_LOCALE_COOKIE } from "../lib/i18n/core";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VP Case System",
  description: "VP Case System",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialLocale = resolvePreferredLocale(undefined, cookieStore.get(UI_LOCALE_COOKIE)?.value);
  return (
    <html lang="th" style={{ colorScheme: "light" }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{
          background: "#ffffff",
          color: "#111111",
          colorScheme: "light",
        }}
      >
        <AppLocaleProvider initialLocale={initialLocale}>{children}</AppLocaleProvider>
      </body>
    </html>
  );
}
