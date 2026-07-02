import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * POST /api/contact — NON-GROWTH contact-form email delivery.
 *
 * Why this exists: pages/Contact.tsx uses <LeadCapture>, which posts to
 * /api/growth/leads (the growth agent — untouched) to capture the lead. That
 * endpoint never sends email by design. The founder wants a contact submission
 * to ALSO reach info@inbharat.ai and the submitter to get an accurate auto-reply
 * — without touching the growth agent. So Contact.tsx makes a second,
 * best-effort POST here for the email leg. The growth-leads capture remains the
 * source of truth; this route only does email.
 *
 * Uses Resend's REST API via fetch (no SDK dependency). Env required for email:
 *   RESEND_API_KEY     — Resend API key (if absent → 503 EMAIL_NOT_CONFIGURED;
 *                        the growth-leads capture still succeeded client-side)
 *   RESEND_FROM        — verified sender, e.g. "InBharat <info@inbharat.ai>".
 *                        inbharat.ai MUST be domain-verified in Resend, else
 *                        Resend only delivers to the account-owner address.
 *                        Falls back to onboarding@resend.dev so misconfiguration
 *                        is visible rather than silent.
 *   CONTACT_NOTIFY_TO  — team destination, default info@inbharat.ai
 *
 * Sends two emails:
 *   1) team notification to CONTACT_NOTIFY_TO (reply-to: submitter, so the
 *      team can hit "reply" to answer the person directly)
 *   2) auto-reply confirmation to the submitter (reply-to: info@inbharat.ai)
 *
 * Honeypot: a non-empty `website` field ⇒ 422 (bot, silently discarded).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const website = String(body.website ?? "").trim();
    if (website) return res.status(422).json({ ok: false, code: "BOT" }); // honeypot

    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const company = String(body.company ?? "").trim();
    const message = String(body.message ?? "").trim();
    const consentText = String(body.consentText ?? "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, code: "INVALID_EMAIL" });
    }
    if (!message) {
      return res.status(400).json({ ok: false, code: "NO_MESSAGE" });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        ok: false,
        code: "EMAIL_NOT_CONFIGURED",
        message: "RESEND_API_KEY not set — message captured by growth agent only.",
      });
    }

    const from = process.env.RESEND_FROM || "InBharat <onboarding@resend.dev>";
    const notifyTo = process.env.CONTACT_NOTIFY_TO || "info@inbharat.ai";
    const senderLabel = name ? `${name} <${email}>` : email;

    const teamSubject = `New contact message from ${senderLabel}`;
    const teamText = [
      `New contact message received via inbharat.ai/contact.`,
      ``,
      `Name: ${name || "(not given)"}`,
      `Email: ${email}`,
      `Company: ${company || "(not given)"}`,
      `Consent: ${consentText || "(n/a)"}`,
      ``,
      `Message:`,
      message,
      ``,
      `Reply directly to this email to respond to ${email}.`,
    ].join("\n");

    const replySubject = `We got your message — InBharat`;
    const replyText = [
      `Hi${name ? ` ${name}` : ""},`,
      ``,
      `Thanks for reaching out to InBharat — we've received your message:`,
      ``,
      `> ${message.replace(/\n/g, "\n> ")}`,
      ``,
      `We read every message and usually reply within a few working days. If your note is urgent, email us directly at info@inbharat.ai.`,
      ``,
      `Just reply to this email and it will reach our team.`,
      ``,
      `— The InBharat team`,
      `https://www.inbharat.ai`,
    ].join("\n");

    const send = (to: string, replyTo: string, subject: string, text: string) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, replyTo, subject, text }),
      });

    const [teamRes, replyRes] = await Promise.all([
      send(notifyTo, email, teamSubject, teamText).catch(() => null),
      send(email, notifyTo, replySubject, replyText).catch(() => null),
    ]);

    const teamOk = !!teamRes && teamRes.ok;
    const replyOk = !!replyRes && replyRes.ok;

    res.setHeader("Cache-Control", "no-store");
    if (teamOk && replyOk) {
      return res.status(200).json({ ok: true, emailed: true });
    }
    // Partial failure — surface which leg failed so the founder can debug Resend.
    return res.status(502).json({
      ok: false,
      emailed: false,
      code: "PARTIAL_SEND",
      teamOk,
      replyOk,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: String(err) });
  }
}