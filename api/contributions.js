// Reads the public GitHub contribution calendar for khanakshah27 and returns it as JSON.
// Runs as a Vercel function, so the browser asks this site (no cross-origin limits),
// and the answer is cached at the edge for a short while.
const USER = "khanakshah27";

function parse(html) {
  const tips = {};
  const tipRe = /<tool-tip[^>]*\sfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g;
  let m;
  while ((m = tipRe.exec(html))) {
    const t = m[2].trim();
    const n = /^No\b/i.test(t) ? 0 : parseInt(t, 10);
    tips[m[1]] = Number.isFinite(n) ? n : 0;
  }
  const days = [];
  const cellRe = /<td\b[^>]*>/g;
  while ((m = cellRe.exec(html))) {
    const tag = m[0];
    const date = /data-date="(\d{4}-\d{2}-\d{2})"/.exec(tag);
    const id = /\sid="([^"]+)"/.exec(tag);
    if (!date || !id) continue;
    days.push({ date: date[1], count: tips[id[1]] || 0 });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

module.exports = async function handler(req, res) {
  try {
    const r = await fetch(`https://github.com/users/${USER}/contributions`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; portfolio-contributions)", accept: "text/html" },
    });
    if (!r.ok) throw new Error("github " + r.status);
    const days = parse(await r.text());
    if (days.length < 300) throw new Error("unexpected page");
    const total = days.reduce((a, d) => a + d.count, 0);
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
    res.status(200).json({ total, contributions: days });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "unavailable" });
  }
};
module.exports.parse = parse;
