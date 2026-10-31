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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "TypeX — Minimalist High-Performance Typing Engine",
  description: "An ultra-minimalist, 120fps fluid typing benchmark powered by a native C++17 telemetry engine.",
  keywords: ["typing test", "wpm test", "monkeytype", "minimalist typing", "TypeX"],
  openGraph: {
    title: "TypeX — High-Performance Typing Engine",
    description: "An ultra-minimalist, 120fps fluid typing benchmark powered by a native C++17 telemetry engine.",
    images: [{ url: "/typex-logo.jpg", width: 1024, height: 1024, alt: "TypeX Kinetic Keycap Logo" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TypeX — Minimalist Typing Engine",
    description: "An ultra-minimalist, 120fps fluid typing benchmark powered by a native C++17 telemetry engine.",
    images: ["/typex-logo.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0C10",
  width: "device-width",
  initialScale: 1,
};

import { ProfileProvider } from "@/context/ProfileContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jetbrainsMono.variable} ${inter.variable}`}>
      <body className="theme-obsidian min-h-screen flex flex-col justify-between selection:bg-amber-500/20 selection:text-amber-200">
        <ProfileProvider>
          {children}
        </ProfileProvider>
      </body>
    </html>
  );
}
