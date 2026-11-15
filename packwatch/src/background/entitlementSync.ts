// ExtensionPay sync (milestone 6).
import type { Plan } from "../shared/types";
import type { Reply } from "../shared/messages";
export function initEntitlements() {}
export async function refreshEntitlement(): Promise<Plan> { return "free"; }
export async function setDevPlan(_p: Plan | null): Promise<Reply> { return { ok: true }; }
export async function chooseActive(_ids: string[]): Promise<Reply> { return { ok: true }; }
