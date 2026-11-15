// Watchlist pack import and boost windows (milestone 8).
import type { BoostWindow } from "../shared/types";
import type { WatchlistPack } from "../shared/packs";
import type { Reply } from "../shared/messages";
export async function importPack(_p: WatchlistPack): Promise<Reply> { return { ok: false, error: "Not yet" }; }
export async function setBoost(_d: string, _b: BoostWindow | null): Promise<Reply> { return { ok: false, error: "Not yet" }; }
