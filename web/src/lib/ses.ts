import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { BASE_URL } from "@/lib/constants";

const ses = new SESClient({ region: process.env.APP_REGION || process.env.AWS_REGION || "us-east-1" });
const SENDER_EMAIL = process.env.SENDER_EMAIL || "filings@zipperdatabrief.com";

export async function sendMagicLinkEmail(
  email: string,
  token: string,
  type: "signup" | "login"
): Promise<void> {
  const verifyUrl = `${BASE_URL}/api/auth/verify?token=${token}`;
  const subject = type === "signup"
    ? "Verify your SEC Filing Digest subscription"
    : "Log in to SEC Filing Digest";
  const heading = type === "signup"
    ? "Welcome to SEC Filing Digest"
    : "Welcome back";
  const cta = type === "signup"
    ? "Verify Email & Subscribe"
    : "Log In";
  const intro = type === "signup"
    ? "Click below to verify your email and start receiving AI-summarized SEC filing alerts."
    : "Click below to log in and manage your watchlist and preferences.";

  const html = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:6px;">
      <div style="background:#1e3a5f;padding:20px 24px;border-radius:5px 5px 0 0;">
        <h1 style="margin:0;font-size:20px;color:#fff;font-weight:700;">SEC Filing Digest</h1>
      </div>
      <div style="padding:32px 24px;">
        <h2 style="margin:0 0 12px;font-size:18px;color:#222;">${heading}</h2>
        <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.5;">${intro}</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:600;font-size:15px;">${cta}</a>
        <p style="margin:24px 0 0;font-size:13px;color:#999;line-height:1.5;">
          If you didn't request this, you can safely ignore this email.<br/>
          This link expires in 1 hour.
        </p>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #eaeaea;font-size:12px;color:#999;text-align:center;">
        <strong style="color:#666;">Zipper Data Brief</strong> &mdash; SEC Filing Digest
      </div>
    </div>`;

  await ses.send(new SendEmailCommand({
    Source: SENDER_EMAIL,
    ReplyToAddresses: ["your-email@example.com"],
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: { Html: { Data: html, Charset: "UTF-8" } },
    },
  }));
}
