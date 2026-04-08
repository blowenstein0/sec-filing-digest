export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  readTime: string;
  content: string;
}

export const posts: BlogPost[] = [
  {
    slug: "how-to-read-an-8k-filing",
    title: "How to Read an 8-K Filing (Without Losing Your Mind)",
    description:
      "8-Ks are the most important SEC filings most investors ignore. Here's how to read them quickly and figure out what actually matters.",
    date: "2026-04-08",
    readTime: "5 min",
    content: `Most investors check earnings. Some read the 10-K once a year. Almost nobody reads 8-Ks consistently. That's a mistake.

An 8-K is a "current report" — a filing companies make when something material happens between quarterly reports. Leadership changes. Asset acquisitions. Earnings releases. Covenant breaches. The stuff that moves stocks before the next 10-Q shows up.

## What triggers an 8-K?

The SEC defines about 20 triggering events, grouped into sections. The ones that matter most:

**Item 1.01 — Entry into a Material Agreement.** New debt facilities, major partnerships, licensing deals. If the company just signed something worth more than 10% of revenue, it shows up here.

**Item 2.02 — Results of Operations.** This is where earnings press releases land. The actual 10-Q comes later, but the 8-K drops the numbers first. If you're watching a stock going into earnings, this is the filing type to track.

**Item 5.02 — Departure of Directors or Officers.** CEO leaves? CFO "steps down to pursue other opportunities"? You'll find it here. The language is always sanitized, but the timing and severance details tell the real story.

**Item 8.01 — Other Events.** The catch-all bucket. Companies use this for anything they want to disclose publicly but doesn't fit neatly elsewhere. Sometimes it's nothing. Sometimes it's the most important filing of the year.

## How to actually read one

Don't read the whole thing. Here's the process:

1. **Check the item numbers.** They're listed right at the top. Item 2.02 on an earnings date? That's the press release. Item 5.02? Someone's leaving. Item 1.01? Follow the money.

2. **Skip to the exhibits.** The 8-K itself is often just a wrapper — a few paragraphs of boilerplate. The real content is in Exhibit 99.1 (press releases) or Exhibit 10.1 (agreements). Always click through.

3. **Read the forward-looking language.** Companies are careful about what they say in 8-Ks because they're legally binding. If they say "expects revenue to decline in the next quarter," that's not hedging. That's a warning.

4. **Check the filing date vs. the event date.** Companies have four business days to file. If they file on day four, they were probably negotiating the language. If they file same-day, they wanted this out fast. Both tell you something.

## Why most investors miss 8-Ks

The problem isn't that 8-Ks are hard to read. It's that there are too many of them. A company like Amazon files dozens per year. Multiply that by a 20-stock watchlist and you're drowning.

That's the problem we built SEC Filing Digest to solve. Every 8-K that matches your watchlist gets summarized into 2-3 sentences by AI. You read the summary. If it matters, you click through to the full filing. If it doesn't, you move on.

No more manually checking for new filings. No more missing a material event because you were busy.`,
  },
  {
    slug: "what-investors-miss-in-proxy-statements",
    title: "What Investors Miss in Proxy Statements",
    description:
      "DEF 14A proxy statements reveal executive compensation, board dynamics, and shareholder battles. Most investors skip them. Here's what they're missing.",
    date: "2026-04-06",
    readTime: "6 min",
    content: `The DEF 14A is the most underread filing in the SEC's catalog. It's the definitive proxy statement — the document companies send before their annual shareholder meeting. And it's full of information you can't find anywhere else.

## What's actually in a proxy statement?

Three things that matter:

### 1. Executive compensation (and what it incentivizes)

The Summary Compensation Table breaks down exactly what the CEO, CFO, and other named executives earned. Base salary. Stock awards. Bonuses. Perks. All of it.

But the numbers alone aren't the story. The structure is. A CEO whose compensation is 90% stock-based is aligned with shareholders in a different way than one pulling $5M in guaranteed cash. Look at the performance metrics tied to bonuses — are they revenue targets? EBITDA? Total shareholder return? This tells you what management is actually optimizing for.

The "Compensation Discussion & Analysis" section (CD&A) explains the board's reasoning. It reads like corporate prose, but if you look past the boilerplate, you'll find the metrics and targets that drive executive behavior for the next year.

### 2. Board composition and independence

The proxy lists every director nominee, their background, tenure, committee memberships, and other board seats. You're looking for a few things:

**Overboarded directors.** Someone sitting on five boards isn't giving your company their full attention. Studies consistently show overboarded directors correlate with weaker governance.

**Tenure clustering.** A board where everyone's been there 15+ years is an entrenchment risk. Fresh perspectives matter, especially in fast-moving industries.

**Committee independence.** The audit, compensation, and nominating committees should be 100% independent directors. If they're not, that's a red flag.

### 3. Shareholder proposals

This is where activist investors and governance advocates make their case directly to shareholders. Common proposals include:

- Requests for climate risk disclosure
- Board declassification (annual vs. staggered elections)
- Executive pay restructuring
- Political spending transparency

The vote results matter even when proposals fail. A shareholder proposal that gets 40% support sends a strong signal to the board, even without a majority. Track these over time — proposals that gain votes year-over-year often foreshadow real changes.

## How AI changes the game

A typical proxy statement runs 60-80 pages. Nobody reads that cover to cover for every company in their portfolio. That's the old way.

With AI summarization, you get the material points in seconds: who's getting paid what, which directors are new, what shareholders voted on. If something looks off, you dig into the full document. If it's routine, you move on.

SEC Filing Digest tracks DEF 14A filings automatically. When a company on your watchlist files a proxy, you get a summary in your next digest. No manual checking required.`,
  },
  {
    slug: "sec-filings-every-investor-should-track",
    title: "The 6 SEC Filing Types Every Investor Should Track",
    description:
      "From 8-Ks to 13Fs, here's a plain-language guide to the SEC filings that actually move stocks and what each one tells you.",
    date: "2026-04-03",
    readTime: "7 min",
    content: `The SEC has over 150 filing types. Most of them don't matter to individual investors. Here are the six that do, ranked by how often they contain market-moving information.

## 1. 8-K — Current Reports

**What it is:** A filing triggered by material events that happen between quarterly reports. Earnings releases, leadership changes, asset acquisitions, bankruptcy filings.

**Why it matters:** 8-Ks are the fastest public signal that something has changed. They hit before the news cycle catches up. If you're monitoring a company and an 8-K drops, pay attention.

**How often:** Varies wildly. Large companies might file 20-30 per year. Small caps might file 5.

## 2. 10-K — Annual Reports

**What it is:** The comprehensive annual filing. Financial statements, risk factors, business description, management discussion and analysis (MD&A), legal proceedings.

**Why it matters:** The 10-K is the single most complete picture of a company's business. The risk factors section alone is worth reading — companies are legally required to disclose what could go wrong. When a new risk factor appears that wasn't there last year, that's a signal.

**How often:** Once per year, within 60-90 days of fiscal year end depending on company size.

## 3. 10-Q — Quarterly Reports

**What it is:** The quarterly version of the 10-K. Financials, MD&A, and updated risk factors, but less comprehensive.

**Why it matters:** Tracks the trajectory between annual reports. Quarter-over-quarter changes in revenue, margins, and cash flow show you the trend before the full-year picture arrives.

**How often:** Three times per year (Q1, Q2, Q3). The Q4 data is covered in the 10-K.

## 4. 13F-HR — Institutional Holdings

**What it is:** A quarterly filing required of institutional investment managers with $100M+ in assets. Lists every equity position they hold.

**Why it matters:** This is how you see what the big funds are buying and selling. When Berkshire adds a new position or a hedge fund exits entirely, the 13F is where it shows up. It's backward-looking (45 days delayed), but the information is still actionable.

**How often:** Quarterly, due 45 days after quarter end.

## 5. SC 13D — Beneficial Ownership (Activist Stakes)

**What it is:** Filed when an investor acquires 5% or more of a company's voting shares with an intent to influence. This is the activist investor disclosure.

**Why it matters:** A 13D filing is a public declaration that someone with money wants to change something. It could be a board seat, a strategic review, a sale of the company. The "Purpose of Transaction" section is the playbook — read it carefully.

**How often:** Filed within 10 days of crossing the 5% threshold. Amendments filed when the stake changes or plans evolve.

**SC 13G** is the passive version — same 5% threshold but no intent to influence. Still useful for tracking institutional ownership concentration.

## 6. DEF 14A — Proxy Statements

**What it is:** The definitive proxy statement sent before annual shareholder meetings. Contains executive compensation, board nominees, and shareholder proposals.

**Why it matters:** This is the governance filing. It tells you how much the CEO makes, what incentives the board set, whether any shareholders are pushing for changes. Compensation structure reveals what management is really optimizing for.

**How often:** Once per year, before the annual meeting.

## How to actually stay on top of this

Here's the math. Say you're watching 10 companies. Each files 1 annual 10-K, 3 quarterly 10-Qs, 15-20 8-Ks, 1 proxy statement, and 4 13F reports from major holders. That's roughly 250+ filings per year across your watchlist.

Nobody's reading 250 filings. The solution is filtered monitoring — watch the filing types that matter for each company, get AI-generated summaries of what changed, and only click through to the full filing when something looks material.

That's exactly what we built with SEC Filing Digest. Pick your companies. Pick your filing types. Get a daily or weekly email with plain-language summaries. The AI reads the filings so you don't have to.`,
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getAllPosts(): BlogPost[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date));
}
