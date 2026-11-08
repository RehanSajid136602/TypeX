import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// The packaged desktop app is served from a random loopback port, so the build
// must never bake an origin into the HTML. Next falls back to
// http://localhost:3000 for relative open-graph images, therefore the social
// image tags are only emitted when a real public origin is provided at build
// time (NEXT_PUBLIC_APP_URL). Everything else uses same-origin relative paths.
const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const socialImage = {
  url: "/typex-logo.jpg",
  width: 1024,
  height: 1024,
  alt: "TypeX Kinetic Keycap Logo",
};

export const metadata: Metadata = {
  ...(publicAppUrl ? { metadataBase: new URL(publicAppUrl) } : {}),
  title: "TypeX — Minimalist High-Performance Typing Engine",
  description: "An ultra-minimalist, 120fps fluid typing benchmark powered by a native C++17 telemetry engine.",
  keywords: ["typing test", "wpm test", "monkeytype", "minimalist typing", "TypeX"],
  openGraph: {
    title: "TypeX — High-Performance Typing Engine",
    description: "An ultra-minimalist, 120fps fluid typing benchmark powered by a native C++17 telemetry engine.",
    type: "website",
    ...(publicAppUrl ? { images: [socialImage] } : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: "TypeX — Minimalist Typing Engine",
    description: "An ultra-minimalist, 120fps fluid typing benchmark powered by a native C++17 telemetry engine.",
    ...(publicAppUrl ? { images: [socialImage.url] } : {}),
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/typex-logo.jpg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0C10",
  width: "device-width",
  initialScale: 1,
};

import { ProfileProvider } from "@/context/ProfileContext";
import { SettingsProvider } from "@/context/SettingsContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jetbrainsMono.variable} ${inter.variable}`}>
      <body className="theme-obsidian min-h-screen flex flex-col justify-between selection:bg-amber-500/20 selection:text-amber-200">
        <ProfileProvider>
          <SettingsProvider>
            {children}
          </SettingsProvider>
        </ProfileProvider>
      </body>
    </html>
  );
}
