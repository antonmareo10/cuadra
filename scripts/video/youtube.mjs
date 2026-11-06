// node scripts/video/youtube.mjs <timeline.json> <synthetic|own> <out.md>
// Writes the YouTube title and description for the demo video, with chapters taken from the
// narration timeline (each chapter at least 10 s, as YouTube requires) and the line that says
// what the voice is.
import fs from "node:fs";

const [timelineFile, voice = "synthetic", out] = process.argv.slice(2);
if (!timelineFile || !out) {
  console.log("usage: node scripts/video/youtube.mjs <timeline.json> <synthetic|own> <out.md>");
  process.exit(1);
}
const tl = JSON.parse(fs.readFileSync(timelineFile, "utf8"));
const start = Object.fromEntries(tl.segments.map((s) => [s.id, s.start]));
const CHAPTERS = [
  ["v01", "The order, the delivery note and the invoice"],
  ["v05", "Cuadra's check, line by line"],
  ["v07", "One decision, and a delivery note as a photo"],
  ["v09", "The invoice that must not be paid"],
  ["v12", "From an AI assistant (MCP)"],
];
const total = tl.total + 2.5;
const chapters = [];
for (const [id, title] of CHAPTERS) {
  const t = id === "v01" ? 0 : start[id];
  if (t === undefined) continue;
  if (chapters.length && t - chapters.at(-1).t < 10) continue; // too short for YouTube: merged into the previous one
  chapters.push({ t, title });
}
if (chapters.length > 1 && total - chapters.at(-1).t < 10) chapters.pop();
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const VOICE = {
  synthetic: "Narration: synthetic voice (Kokoro-82M, open model); the screen recording is the real app.",
  own: "Narration: my voice, generated from my own recordings with an open voice model; the screen recording is the real app.",
}[voice];
if (!VOICE) throw new Error(`voice must be synthetic or own, not ${voice}`);

const md = `# YouTube upload (unlisted)

## Title

Cuadra: pay the right amount, to the right account (Clocked Build Challenge)

## Description

Cuadra checks a small restaurant's supplier invoices before anyone pays them. Give it the chef's WhatsApp order, the delivery note the kitchen signed (a phone photo is fine) and the supplier's invoice. It reads all three with the Clocked API, checks every line against the other two, and gives one decision: what to pay now, what to claim back and what not to pay at all.

${chapters.map((c) => `${mmss(c.t)} ${c.title}`).join("\n")}

Try it, no sign-up: https://cuadra-alpha-blush.vercel.app
Code (MIT): https://github.com/antonmareo10/cuadra

${VOICE} The app scenes are recorded from the web app replaying real Clocked runs (recorded on 3 and 5 November 2026). The documents are synthetic; the close-ups of them and the assistant scene are drawn from the same data.

Built for the Clocked Build Challenge 2026. #ClockedChallenge

## Settings

- Visibility: Unlisted
- Subtitles: upload the .srt next to the video, language English
- Category: Science & Technology
- Made for kids: No
`;
fs.writeFileSync(out, md);
console.log(`wrote ${out} (${chapters.length} chapters, ${mmss(total)})`);
