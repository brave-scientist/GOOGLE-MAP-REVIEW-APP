import type { Metadata } from "next";
import Script from "next/script";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { CommandPalette } from "@/components/app/command-palette";
import { BusinessProvider } from "@/lib/business-context";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ReviewReply Enterprise — Turn every customer into a five-star review",
  description:
    "ReviewReply aggregates reviews from Google Business Profile and Facebook Pages into one unified inbox. ReviewReply AI drafts on-brand replies in seconds.",
  keywords: [
    "review management",
    "Google reviews",
    "AI reply",
    "reputation management",
    "local SEO",
    "SaaS",
  ],
  authors: [{ name: "ReviewReply Enterprise" }],
  openGraph: {
    title: "ReviewReply Enterprise",
    description: "Turn every customer into a five-star review.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-WZ2DM9W9W3"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-WZ2DM9W9W3');
          `}
        </Script>
      </head>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground font-sans`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <BusinessProvider>
            {children}
            <Toaster />
            <SonnerToaster />
            <CommandPalette />
          </BusinessProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
