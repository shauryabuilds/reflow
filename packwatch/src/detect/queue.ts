// Waiting rooms and bot challenges. When one is detected Packwatch stops reloading
// immediately: refreshing a queue page loses the user's place.
import { stockRules } from "../shared/data";

export interface QueueHit { kind: "queue" | "challenge" | "block"; evidence: string }

const QUEUE_URL = /(^|\.)queue-it\.net|\/queue\b|waitingroom|waiting-room/i;
const QUEUE_MARKUP = /static\.queue-it\.net|queueit|data-queueit|queue-it_/i;
const CHALLENGE = [
  { re: /<title>\s*just a moment\.{0,3}\s*<\/title>/i, ev: "Cloudflare “Just a moment” page" },
  { re: /<title>\s*verifying (your connection|you are human)\.{0,3}\s*<\/title>/i, ev: "“Verifying your connection” bot check" },
  { re: /cf-chl-|challenge-platform|cf_chl_opt|cdn-cgi\/challenge/i, ev: "Cloudflare challenge markup" },
  { re: /checking (if the site connection is secure|your browser)|verify you are human/i, ev: "Bot check text" },
  { re: /px-captcha|perimeterx|_pxCaptcha/i, ev: "PerimeterX challenge" },
  { re: /captcha-delivery\.com|datadome/i, ev: "DataDome challenge" },
];
const BLOCK = [
  { re: /incapsula incident id|_Incapsula_Resource|Request unsuccessful\. Incapsula/i, ev: "Incapsula/Imperva block page" },
  { re: /<title>\s*access denied\s*<\/title>[\s\S]*reference\s*#/i, ev: "Akamai “Access Denied” page" },
];

export function detectQueue(html: string, url = "", locale = "en"): QueueHit | null {
  if (url && QUEUE_URL.test(safeHost(url) + new URL(url, "https://x/").pathname)) return { kind: "queue", evidence: "Waiting-room URL" };
  const head = html.slice(0, 200_000);
  if (QUEUE_MARKUP.test(head)) return { kind: "queue", evidence: "Queue-it waiting room markup" };
  const text = head.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  if (new RegExp(stockRules(locale).queue, "i").test(text)) return { kind: "queue", evidence: "Waiting-room text" };
  for (const c of CHALLENGE) if (c.re.test(head)) return { kind: "challenge", evidence: c.ev };
  for (const b of BLOCK) if (b.re.test(head)) return { kind: "block", evidence: b.ev };
  return null;
}

function safeHost(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}
