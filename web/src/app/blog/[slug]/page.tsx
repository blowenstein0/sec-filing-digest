import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getPost, getAllPosts } from "@/lib/blog";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  return {
    title: `${post.title} — SEC Filing Digest`,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      siteName: "SEC Filing Digest",
    },
  };
}

function renderMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h2
          key={i}
          className="text-xl font-bold text-gray-900 mt-8 mb-3"
        >
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3
          key={i}
          className="text-lg font-semibold text-gray-900 mt-6 mb-2"
        >
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(
        <p key={i} className="font-semibold text-gray-900 mt-4 mb-1">
          {line.slice(2, -2)}
        </p>
      );
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc pl-6 space-y-1 my-2">
          {items.map((item, j) => (
            <li key={j} className="text-gray-700 leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (line.trim() === "") {
      // skip blank lines
    } else {
      // Render inline bold
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      elements.push(
        <p key={i} className="text-gray-700 leading-relaxed my-3">
          {parts.map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={j} className="text-gray-900">
                {part.slice(2, -2)}
              </strong>
            ) : (
              part
            )
          )}
        </p>
      );
    }
    i++;
  }

  return elements;
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      "@type": "Person",
      name: "Brad Lowenstein",
      jobTitle: "Founder, Zipper Data Co",
      url: "https://bradlowenstein.com",
    },
    publisher: {
      "@type": "Organization",
      name: "Zipper Data Co",
      url: "https://zipperdataco.com",
    },
    mainEntityOfPage: `https://sec.zipperdatabrief.com/blog/${post.slug}`,
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <Link
        href="/blog"
        className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        &larr; Back to blog
      </Link>

      <article className="mt-6">
        <p className="text-sm text-gray-400">
          By{" "}
          <a href="https://bradlowenstein.com" className="text-gray-500 hover:text-gray-700">
            Brad Lowenstein
          </a>{" "}
          &middot;{" "}
          {new Date(post.date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}{" "}
          &middot; {post.readTime} read
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900 leading-tight">
          {post.title}
        </h1>

        <div className="mt-8">{renderMarkdown(post.content)}</div>

        <div className="mt-12 p-6 bg-gray-50 rounded-xl border border-gray-200">
          <p className="font-semibold text-gray-900">
            Stop manually checking for new filings
          </p>
          <p className="mt-1 text-sm text-gray-600">
            SEC Filing Digest monitors SEC filings and delivers AI-summarized
            alerts to your inbox. Free for up to 3 companies.
          </p>
          <Link
            href="/signup"
            className="mt-3 inline-block bg-blue-900 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </article>
    </div>
  );
}
