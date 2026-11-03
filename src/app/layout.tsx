import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "MCS-Chat — Central de Atendimento & Campanhas",
  description: "Plataforma corporativa MCS de comunicação via WhatsApp e campanhas operacionais",
  other: {
    google: "notranslate",
  },
};

import { ThemeProvider } from "@/components/ui/theme-provider";
import { I18nProvider } from "@/contexts/i18n-context";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt"
      translate="no"
      className={`notranslate ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        translate="no"
        className="notranslate min-h-full flex flex-col bg-chat-surface-bg transition-colors duration-300"
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <I18nProvider>
            {children}
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
