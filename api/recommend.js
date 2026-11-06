// Receives a book recommendation from the site and saves it as an issue in a private
// GitHub repo, so it lands with the site owner (and GitHub notifies them).
// Needs two environment variables in Vercel:
//   RECS_GITHUB_TOKEN  a fine-grained token with "Issues: read and write" on that repo
//   RECS_REPO          the repo to store them in, e.g. "khanakshah27/book-recs"
const hits = new Map(); // per-instance throttle: ip -> [timestamps]

function clean(t) {
  return String(t == null ? "" : t)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/@/g, "@​"); // no accidental @mentions
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const token = process.env.RECS_GITHUB_TOKEN;
  const repo = process.env.RECS_REPO;
  if (!token || !repo) return res.status(503).json({ error: "not_configured" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  if (body.website) return res.status(200).json({ ok: true }); // honeypot: pretend it worked

  const ip = String((req.headers && (req.headers["x-forwarded-for"] || "")) || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 5) return res.status(429).json({ error: "slow_down" });
  recent.push(now); hits.set(ip, recent);

  const rec = clean(body.rec).trim().slice(0, 600);
  const name = clean(body.name).trim().slice(0, 60);
  if (rec.length < 3) return res.status(400).json({ error: "empty" });

  const title = "Book rec: " + rec.replace(/\s+/g, " ").slice(0, 70);
  const text = "> " + rec.replace(/\n/g, "\n> ") + "\n\n— " + (name || "anonymous") + "\n\n_Dropped in the box on the portfolio site, " + new Date().toISOString() + "_";
  try {
    const r = await fetch("https://api.github.com/repos/" + repo + "/issues", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "portfolio-recommendations",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ title, body: text }),
    });
    if (!r.ok) return res.status(502).json({ error: "github_" + r.status });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: "unreachable" });
  }
};
