// Builds a robust CSS selector for a picked element: prefer id, data-* and stable classes,
// avoid nth-child chains (they break when the shop rearranges its page).

const STABLE_ATTRS = ["data-testid", "data-test", "data-qa", "data-action", "data-cy", "name", "data-role", "data-add-to-cart", "aria-label", "type"];
const STATE_CLASS = /^(is-|has-|js-|active|hover|focus|disabled|selected|open|hidden|visible|loading|show|ng-|css-|sc-|jsx-)/i;

const cssEsc = (s: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, "\\$1"));

/** Generated-looking tokens: long digit runs, hashes, framework ids. */
export function looksGenerated(s: string): boolean {
  return /\d{4,}/.test(s) || /^[a-f0-9]{8,}$/i.test(s) || /[_-][a-z0-9]{5,}$/i.test(s) && /\d/.test(s) || /^(ember|react|vue|radix|headlessui|mui)[-:]/i.test(s) || s.includes(":");
}

function stableClasses(el: Element): string[] {
  return Array.from(el.classList).filter((c) => c.length > 1 && c.length < 40 && !STATE_CLASS.test(c) && !looksGenerated(c));
}

function unique(doc: Document | ParentNode, sel: string, el: Element): boolean {
  try {
    const all = doc.querySelectorAll(sel);
    return all.length === 1 && all[0] === el;
  } catch { return false; }
}

/** One element's own selector (no ancestors), or null if nothing stable is available. */
function ownSelector(el: Element, doc: Document): string | null {
  const tag = el.tagName.toLowerCase();
  if (el.id && !looksGenerated(el.id) && unique(doc, `#${cssEsc(el.id)}`, el)) return `#${cssEsc(el.id)}`;
  for (const a of STABLE_ATTRS) {
    const v = el.getAttribute(a);
    if (v && v.length < 60 && !looksGenerated(v)) {
      const sel = `${tag}[${a}="${v.replace(/"/g, '\\"')}"]`;
      if (unique(doc, sel, el)) return sel;
    }
  }
  for (const a of Array.from(el.attributes)) {
    if (a.name.startsWith("data-") && !STABLE_ATTRS.includes(a.name) && a.value.length < 40 && !looksGenerated(a.value) && !looksGenerated(a.name)) {
      const sel = a.value ? `${tag}[${a.name}="${a.value.replace(/"/g, '\\"')}"]` : `${tag}[${a.name}]`;
      if (unique(doc, sel, el)) return sel;
    }
  }
  const cls = stableClasses(el);
  for (let n = 1; n <= Math.min(3, cls.length); n++) {
    const sel = `${tag}.${cls.slice(0, n).map(cssEsc).join(".")}`;
    if (unique(doc, sel, el)) return sel;
  }
  return null;
}

function localPart(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const cls = stableClasses(el).slice(0, 2).map(cssEsc);
  return cls.length ? `${tag}.${cls.join(".")}` : tag;
}

/** The clickable control the user meant (they often hover a span inside a button). */
export function normalizeTarget(el: Element): Element {
  return el.closest('button, a, input[type="submit"], input[type="button"], [role="button"]') ?? el;
}

export function buildSelector(target: Element): string {
  const doc = target.ownerDocument;
  const own = ownSelector(target, doc);
  if (own) return own;
  // Anchor on the nearest ancestor with a stable selector, then descend with tag + classes.
  const parts: string[] = [localPart(target)];
  let node = target.parentElement;
  for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
    const anchor = ownSelector(node, doc);
    if (anchor) {
      const short = `${anchor} ${parts[parts.length - 1]}`;
      if (unique(doc, short, target)) return short;
    }
    const sel = (anchor ?? localPart(node)) + " " + parts.join(" > ");
    if (unique(doc, sel, target)) return sel;
    if (anchor) {
      // Anchor found but still ambiguous below it: last resort, one nth-of-type at the target level.
      const siblings = target.parentElement ? Array.from(target.parentElement.children).filter((c) => c.tagName === target.tagName) : [];
      const idx = siblings.indexOf(target) + 1;
      const withNth = `${anchor} ${parts.slice(0, -1).concat(`${parts[parts.length - 1]}:nth-of-type(${idx})`).join(" > ")}`;
      if (idx > 0 && unique(doc, withNth, target)) return withNth;
    }
    parts.unshift(localPart(node));
  }
  // Absolute fallback: nth-of-type path from body (rare; flagged as fragile in the UI).
  const path: string[] = [];
  for (let e: Element | null = target; e && e !== doc.body; e = e.parentElement) {
    const sib = e.parentElement ? Array.from(e.parentElement.children).filter((c) => c.tagName === e!.tagName) : [];
    path.unshift(sib.length > 1 ? `${e.tagName.toLowerCase()}:nth-of-type(${sib.indexOf(e) + 1})` : e.tagName.toLowerCase());
  }
  return `body > ${path.join(" > ")}`;
}
