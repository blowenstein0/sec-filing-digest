import Link from "next/link";

const FORM_TYPES_PREVIEW = [
  { label: "8-K", desc: "Material events" },
  { label: "10-K", desc: "Annual reports" },
  { label: "10-Q", desc: "Quarterly reports" },
  { label: "13F", desc: "Fund holdings" },
  { label: "SC 13D", desc: "Activist stakes" },
  { label: "DEF 14A", desc: "Proxy statements" },
];

export default function Home() {
  return (
    <div>
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

      {/* Pricing */}
      <section className="py-16 px-4 bg-gray-50">
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
                price: "$29/mo",
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
