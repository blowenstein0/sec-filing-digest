import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "SEC Filing Digest — AI-Summarized Filing Alerts for Investors",
  description:
    "Personalized SEC filing alerts with AI summaries. Monitor companies by watchlist, form type, and keyword. Built for investors who don't want to fall behind.",
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
    description: "AI-summarized SEC filing alerts for investors. Monitor 10-Ks, 8-Ks, and financial disclosures by company, form type, and keyword.",
  },
  keywords: [
    "SEC filing alerts",
    "SEC financial disclosures",
    "SEC filing digest",
    "AI SEC filing summary",
    "8-K alerts",
    "10-K alerts",
    "SEC filing notifications",
    "SEC filing tracker",
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
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Zipper Data Co",
    url: "https://zipperdataco.com",
    brand: {
      "@type": "Brand",
      name: "SEC Filing Digest",
      url: "https://sec.zipperdatabrief.com",
    },
    contactPoint: {
      "@type": "ContactPoint",
      email: "sales@zipperdatabrief.com",
      contactType: "sales",
    },
  };

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-gray-900 font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
