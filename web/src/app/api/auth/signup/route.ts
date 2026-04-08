import { getUser, createUser, createMagicLink } from "@/lib/dynamodb";
import { sendMagicLinkEmail, sendNewSignupNotification } from "@/lib/ses";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  let type: "signup" | "login" = "signup";

  const existing = await getUser(normalizedEmail);
  if (existing) {
    if (existing.status === "active" || existing.status === "paused") {
      type = "login";
    } else if (existing.status === "unsubscribed") {
      type = "login"; // let them reactivate
    }
    // pending users get another signup link
  } else {
    try {
      await createUser(normalizedEmail);
    } catch {
      // race condition — user created between check and insert
      type = "login";
    }
  }

  const token = await createMagicLink(normalizedEmail, type);
  await sendMagicLinkEmail(normalizedEmail, token, type);

  if (type === "signup") {
    sendNewSignupNotification(normalizedEmail).catch(() => {});
  }

  return Response.json({ ok: true, type });
}
