// api/assessment-request.js
// Emails each Free Assessment request from tutorklub.com to the tutor inbox via Resend.
// Needs RESEND_API_KEY in this Vercel project. Optional: TUTOR_EMAIL (default tutor@tutorklub.com).

const LIMITS = { name: 60, grade: 20, subject: 40, phone: 25, time: 40 };

function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body && typeof req.body === "object" ? req.body : {};

  // Hidden trap field: real parents never fill it, bots do. Pretend success.
  if (body.website) return res.status(200).json({ ok: true });

  const d = {};
  for (const k of Object.keys(LIMITS)) d[k] = clean(body[k], LIMITS[k]);
  if (!d.name || !d.grade || !d.subject || !d.phone || !d.time) {
    return res.status(400).json({ error: "Missing fields" });
  }
  if (!/^\+?[0-9 ]{6,20}$/.test(d.phone)) return res.status(400).json({ error: "Invalid phone" });

  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: "Email not configured" });

  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const waDigits = d.phone.replace(/[^0-9]/g, "");
  const title = `Assessment call – ${d.name}, ${d.grade} ${d.subject}`;
  const details = `Parent WhatsApp: ${d.phone}\nBest time: ${d.time}\nRequested: ${when} IST\nSource: tutorklub.com Free Assessment form`;
  const calUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent(title) + "&details=" + encodeURIComponent(details);

  const rows = [["Child's name", d.name], ["Grade", d.grade], ["Subject", d.subject],
    ["Parent WhatsApp", d.phone], ["Best time to contact", d.time], ["Requested", when + " IST"]]
    .map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#5a6478">${k}</td><td style="padding:6px 0;font-weight:700;color:#1a2744">${esc(v)}</td></tr>`)
    .join("");

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a2744;max-width:560px">
<h2 style="margin:0 0 4px">New Free Assessment request</h2>
<p style="margin:0 0 16px;color:#5a6478">From the tutorklub.com website form.</p>
<table style="border-collapse:collapse;margin-bottom:20px">${rows}</table>
<p style="margin:0 0 12px"><a href="${calUrl}" style="background:#0e8a7c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:24px;font-weight:700;display:inline-block">Add to Google Calendar</a></p>
<p style="margin:0 0 20px"><a href="https://wa.me/${waDigits}" style="color:#0e8a7c;font-weight:700">Open WhatsApp chat with parent</a></p>
<p style="margin:0;color:#8491a8;font-size:12px">Next: create the student login in the portal and send the assessment link on WhatsApp.</p>
</div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "TutorKlub <hello@tutorklub.com>",
        to: [process.env.TUTOR_EMAIL || "tutor@tutorklub.com"],
        subject: `New assessment request: ${d.name} (${d.grade}, ${d.subject})`,
        html,
      }),
    });
    if (!r.ok) {
      console.error("assessment-request resend error", r.status, await r.text());
      return res.status(502).json({ error: "Email failed" });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("assessment-request", e.message);
    return res.status(500).json({ error: "Email failed" });
  }
};
