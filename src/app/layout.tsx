import type { Metadata } from "next";
import Script from "next/script";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { CommandPalette } from "@/components/app/command-palette";
import { BusinessProvider } from "@/lib/business-context";
import { SITE_CONFIG } from "@/lib/site-config";

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
  metadataBase: new URL(SITE_CONFIG.url),
  alternates: {
    canonical: '/',
  },
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
  authors: [{ name: SITE_CONFIG.legalName, url: SITE_CONFIG.url }],
  openGraph: {
    title: "ReviewReply Enterprise",
    description: "Turn every customer into a five-star review.",
    url: SITE_CONFIG.url,
    siteName: SITE_CONFIG.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ReviewReply Enterprise",
    description: "Turn every customer into a five-star review.",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_CONFIG.name,
  legalName: SITE_CONFIG.legalName,
  url: SITE_CONFIG.url,
  email: SITE_CONFIG.supportEmail,
  telephone: "+91" + SITE_CONFIG.phone.replace(/\s+/g, ""),
  address: {
    "@type": "PostalAddress",
    streetAddress: SITE_CONFIG.address.line1,
    addressLocality: SITE_CONFIG.address.locality,
    addressRegion: SITE_CONFIG.address.region,
    postalCode: SITE_CONFIG.address.postalCode,
    addressCountry: "IN",
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
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
