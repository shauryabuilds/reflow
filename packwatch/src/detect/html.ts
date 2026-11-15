// DOM parsing for detectors. Works in the offscreen document, the popup and happy-dom tests.
export function parseHTML(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

export function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  const h = el as HTMLElement;
  const val = (h as HTMLInputElement).value;
  const parts = [h.textContent || "", el.getAttribute("aria-label") || "", el.tagName === "INPUT" ? val || "" : ""];
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function isDisabled(el: Element): boolean {
  return el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true" || /\bdisabled\b/i.test(el.getAttribute("class") || "");
}
