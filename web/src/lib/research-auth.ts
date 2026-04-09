import { cookies } from "next/headers";

const RESEARCH_COOKIE = "research_access";
const RESEARCH_PASSWORD = process.env.RESEARCH_PASSWORD || "cheeky";

export async function getResearchAuth(): Promise<string | null> {
  if (process.env.NODE_ENV === "development") return "dev@localhost";

  const cookieStore = await cookies();
  const token = cookieStore.get(RESEARCH_COOKIE)?.value;
  if (token === RESEARCH_PASSWORD) return "guest@research";
  return null;
}
