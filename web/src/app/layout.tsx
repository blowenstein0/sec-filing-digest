import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "SEC Filing Digest — AI-Summarized Filing Alerts for Investors",
  description:
    "Personalized SEC filing alerts with AI summaries. Monitor companies by watchlist, form type, and keyword. Built for search fund operators, small-fund PMs, and independent analysts.",
  metadataBase: new URL("https://sec.zipperdatabrief.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    title: "SEC Filing Digest — AI-Summarized Filing Alerts",
    description:
      "Never miss a material SEC filing. AI-summarized 8-K, 10-K, 10-Q, and proxy alerts delivered daily or weekly.",
    siteName: "SEC Filing Digest",
    url: "https://sec.zipperdatabrief.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "SEC Filing Digest",
    description: "AI-summarized SEC filing alerts for investors. Monitor EDGAR filings by company, form type, and keyword.",
  },
  keywords: [
    "SEC filing alerts",
    "EDGAR monitoring",
    "SEC filing digest",
    "AI SEC filing summary",
    "8-K alerts",
    "10-K alerts",
    "SEC filing notifications",
    "EDGAR filing tracker",
    "SEC filings email",
    "investor filing alerts",
  ],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-gray-900 font-sans">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
