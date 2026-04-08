import Link from "next/link";

const FORM_TYPES_PREVIEW = [
  { label: "8-K", desc: "Material events" },
  { label: "10-K", desc: "Annual reports" },
  { label: "10-Q", desc: "Quarterly reports" },
  { label: "13F", desc: "Fund holdings" },
  { label: "SC 13D", desc: "Activist stakes" },
  { label: "DEF 14A", desc: "Proxy statements" },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SEC Filing Digest",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description:
    "AI-summarized SEC filing alerts delivered to your inbox. Monitor EDGAR filings by company, form type, and keyword.",
  url: "https://sec.zipperdatabrief.com",
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description: "3 companies, weekly digest",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "39",
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        billingDuration: "P1M",
      },
      description: "25 companies, daily digest, all form types, keyword alerts",
    },
  ],
  provider: {
    "@type": "Organization",
    name: "Zipper Data Co",
    url: "https://zipperdataco.com",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is SEC Filing Digest?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "SEC Filing Digest is an AI-powered tool that monitors EDGAR for new SEC filings from companies on your watchlist and delivers plain-language summaries to your inbox daily or weekly.",
      },
    },
    {
      "@type": "Question",
      name: "What SEC filing types does it track?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "SEC Filing Digest tracks 8-K (current reports), 10-K (annual reports), 10-Q (quarterly reports), 13F (institutional holdings), SC 13D (activist stakes), and DEF 14A (proxy statements).",
      },
    },
    {
      "@type": "Question",
      name: "How much does SEC Filing Digest cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The free tier includes 3 companies with weekly digests. The Pro tier costs $39/month and includes 25 companies, daily digests, all form types, and keyword alerts. Enterprise pricing is available for larger teams.",
      },
    },
    {
      "@type": "Question",
      name: "How does the AI summarization work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "When a new filing is detected on EDGAR, the full filing text is fetched and summarized by AI into 2-3 investor-focused sentences highlighting material events, financial changes, and strategic shifts.",
      },
    },
  ],
};

export default function Home() {
  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {/* Hero */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">
            Never miss a material SEC filing
          </h1>
          <p className="mt-6 text-lg text-gray-600 leading-relaxed">
            AI-summarized filing alerts delivered to your inbox. Monitor your
            watchlist by company, form type, and keyword. Built for investors who
            can&apos;t afford AlphaSense but can&apos;t afford to miss a filing.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="bg-blue-900 text-white px-6 py-3 rounded-lg font-semibold text-lg hover:bg-blue-800 transition-colors"
            >
              Start Free &mdash; 3 Companies
            </Link>
            <span className="text-sm text-gray-500">No credit card required</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-12">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Build your watchlist",
                desc: "Add companies by ticker or CIK. Choose which filing types matter to you.",
              },
              {
                step: "2",
                title: "We monitor EDGAR",
                desc: "Every 15 minutes, we check for new filings matching your watchlist.",
              },
              {
                step: "3",
                title: "Get your digest",
                desc: "AI-summarized filing alerts delivered daily or weekly. Plain language, no noise.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-lg mx-auto">
                  {item.step}
                </div>
                <h3 className="mt-4 font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Filing types */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">
            Filing types we track
          </h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {FORM_TYPES_PREVIEW.map((ft) => (
              <div
                key={ft.label}
                className="border border-gray-200 rounded-lg p-4"
              >
                <span className="font-mono font-bold text-blue-900">
                  {ft.label}
                </span>
                <p className="mt-1 text-sm text-gray-600">{ft.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example digest */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">
            Here&apos;s what you&apos;ll get
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-900 px-6 py-4">
              <p className="text-white font-bold text-lg">SEC Filing Digest</p>
              <p className="text-gray-400 text-sm mt-0.5">April 8, 2026</p>
              <p className="text-gray-400 text-sm mt-1">Watching: AAPL &middot; AMZN &middot; GOOGL &middot; NVDA &middot; TSLA</p>
            </div>
            <div className="divide-y divide-gray-100">
              {[
                {
                  company: "NVIDIA Corporation",
                  form: "8-K",
                  date: "Mar 6",
                  summary: "NVIDIA\u2019s Compensation Committee adopted the FY2027 Variable Compensation Plan, with CEO Jen-Hsun Huang\u2019s target bonus set at $4.0M (200% of base salary) and four other executives at $1.5M each, tied to fiscal 2027 revenue achievement.",
                },
                {
                  company: "Amazon.com, Inc.",
                  form: "8-K",
                  date: "Mar 16",
                  summary: "Amazon closed a \u20ac14.5B multi-tranche euro-denominated debt offering with maturities from 2028 to 2064, generating approximately \u20ac14.4B in net proceeds for operations, acquisitions, or balance sheet management.",
                },
                {
                  company: "Apple Inc.",
                  form: "8-K",
                  date: "Feb 24",
                  summary: "Apple held its Annual Meeting where all eight directors were re-elected, Ernst & Young was approved as auditor, and shareholders rejected a \u201cChina Entanglement Audit\u201d proposal by an overwhelming margin (8.94B votes against vs 129M in favor).",
                },
                {
                  company: "Alphabet Inc.",
                  form: "8-K",
                  date: "Apr 2",
                  summary: "VP and Corporate Controller Amie Thuener O\u2019Toole resigned effective April 9, 2026 to pursue another opportunity. Routine executive departure with no disagreements cited.",
                },
                {
                  company: "Tesla, Inc.",
                  form: "8-K",
                  date: "Apr 2",
                  summary: "Tesla produced 408,386 vehicles and delivered 358,023 in Q1 2026, with 8.8 GWh of energy storage deployed. Full financial results to be reported April 22 after market close.",
                },
              ].map((item) => (
                <div key={item.company} className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{item.company}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-mono font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded">{item.form}</span>
                    <span className="text-xs text-gray-400">{item.date}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.summary}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 bg-gray-50 text-xs text-gray-400 text-center border-t border-gray-100">
              Zipper Data Brief &mdash; SEC Filing Digest
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-12">
            Simple pricing
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Free",
                price: "$0",
                features: ["3 companies", "Weekly digest", "8-K and 10-K only"],
                cta: "Start Free",
                highlight: false,
              },
              {
                name: "Pro",
                price: "$39/mo",
                features: [
                  "25 companies",
                  "Daily digest",
                  "All form types",
                  "Keyword alerts",
                  "AI plain-language summaries",
                ],
                cta: "Start Free Trial",
                highlight: true,
              },
              {
                name: "Enterprise",
                price: "Custom",
                features: [
                  "Unlimited companies",
                  "Daily digest",
                  "Everything in Pro",
                  "Slack integration",
                  "Shared watchlists",
                  "Dedicated support",
                ],
                cta: "Contact Sales",
                highlight: false,
                href: "mailto:sales@zipperdatabrief.com",
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`rounded-xl border p-6 ${
                  tier.highlight
                    ? "border-blue-900 ring-2 ring-blue-900"
                    : "border-gray-200"
                }`}
              >
                <h3 className="font-semibold text-lg">{tier.name}</h3>
                <p className="mt-2 text-3xl font-bold">{tier.price}</p>
                <ul className="mt-6 space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="text-green-600 mt-0.5">&#10003;</span>
                      {f}
                    </li>
                  ))}
                </ul>
                {"href" in tier ? (
                  <a
                    href={tier.href}
                    className="mt-6 block text-center py-2 rounded-md font-medium text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    {tier.cta}
                  </a>
                ) : (
                  <Link
                    href="/signup"
                    className={`mt-6 block text-center py-2 rounded-md font-medium text-sm ${
                      tier.highlight
                        ? "bg-blue-900 text-white hover:bg-blue-800"
                        : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {tier.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Stop manually checking EDGAR
          </h2>
          <p className="mt-4 text-gray-600">
            Join investors who get AI-summarized SEC filing alerts delivered to their inbox.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block bg-blue-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-800 transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </section>
    </div>
  );
}
