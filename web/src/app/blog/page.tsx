import Link from "next/link";
import type { Metadata } from "next";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — SEC Filing Digest",
  description:
    "Guides and insights on SEC filings, financial disclosures, and investment research. Learn how to read 8-Ks, 10-Ks, proxy statements, and more.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold text-gray-900">Blog</h1>
      <p className="mt-2 text-gray-600">
        Guides on SEC filings, financial disclosures, and smarter investment research.
      </p>

      <div className="mt-10 space-y-10">
        {posts.map((post) => (
          <article key={post.slug}>
            <Link href={`/blog/${post.slug}`} className="group block">
              <p className="text-sm text-gray-400">
                {new Date(post.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}{" "}
                &middot; {post.readTime} read
              </p>
              <h2 className="mt-1 text-xl font-semibold text-gray-900 group-hover:text-blue-900 transition-colors">
                {post.title}
              </h2>
              <p className="mt-2 text-gray-600 leading-relaxed">
                {post.description}
              </p>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
