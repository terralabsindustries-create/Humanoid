import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { THEME_SCRIPT } from "@/lib/store/preferences";

/**
 * Type.
 *
 * Geist for the product: a neo-grotesk with the tight, even colour that dense
 * operational tables need. Geist Mono for anything a person compares or reads
 * back aloud — timestamps, phone numbers, durations, identifiers. Instrument
 * Serif for the handful of editorial moments (empty states, onboarding,
 * milestones) where the interface is allowed to speak rather than report.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Humanoid",
  description: "The control system for your AI workforce.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en-GB"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the stored theme before the first paint. A flash of the
            wrong theme is not acceptable in a product people open at 6am. */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
          suppressHydrationWarning
        />
      </head>
      <body className="min-h-full">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
