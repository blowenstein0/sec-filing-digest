import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "SEC Filing Digest — AI-Summarized Filing Alerts for Investors",
  description:
    "Personalized SEC filing alerts with AI summaries. Monitor companies by watchlist, form type, and keyword. Built for search fund operators, small-fund PMs, and independent analysts.",
  metadataBase: new URL("https://sec.zipperdatabrief.com"),
  openGraph: {
    type: "website",
    title: "SEC Filing Digest — AI-Summarized Filing Alerts",
    description:
      "Never miss a material SEC filing again. AI-summarized alerts delivered to your inbox.",
    siteName: "SEC Filing Digest",
  },
  twitter: {
    card: "summary",
    title: "SEC Filing Digest",
    description: "AI-summarized SEC filing alerts for investors.",
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
