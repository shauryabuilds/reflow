// Element picker flow (milestone 4) and finalizing drafts after a permission grant.
import type { Draft } from "../shared/types";
import type { Reply } from "../shared/messages";
export async function startPicker(_tabId: number, _draft: Draft): Promise<Reply> { return { ok: false, error: "Not yet" }; }
export async function onPicked(_d: string, _s: string, _t: string): Promise<Reply> { return { ok: false, error: "Not yet" }; }
export async function finalizePendingFor(_origins: string[]): Promise<void> {}
