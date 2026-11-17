// Core domain types. Game and product-type tags are plain strings whose
// allowed values come from src/data/tags.json, so adding a game needs no code.
export type GameTag = string;
export type ProductTypeTag = string;

export type MonitorKind = "product" | "listing" | "simple";
export type CheckMode = "fetch" | "tab";
export type Strategy = "shopify" | "jsonld" | "selector" | "heuristic";
export type StockState = "unknown" | "out" | "in" | "preorder" | "queue" | "error" | "paused";
/** The subset of states that describes stock (never error/queue/paused). */
export type StableState = "unknown" | "out" | "in" | "preorder";
export type Priority = "wake-me" | "normal" | "silent";

export interface Money {
  amount: number;
  currency: string; // ISO 4217, upper case
}

export interface QuietHours {
  start: string; // "22:00" local time
  end: string; // "07:00"
}

export interface InStockRule {
  locale: string; // key into stockRules.json, e.g. "en"
  inStock?: string; // custom regex source overrides the locale default
  outOfStock?: string;
  useEnabled?: boolean; // a disabled button means out of stock
}

export interface AlertOn {
  restock: boolean;
  preorder: boolean;
  priceAtOrBelow?: Money;
}

export interface BoostWindow {
  days: number[]; // 0 = Sunday
  startHour: number; // inclusive, local time
  endHour: number; // exclusive
  intervalSec: number; // used inside the window
  outsideIntervalSec: number; // used outside it
}

export interface Monitor {
  id: string;
  kind: MonitorKind;
  url: string;
  title: string;
  shopDomain: string;
  region?: string;
  game?: GameTag;
  productType?: ProductTypeTag;
  mode: CheckMode;
  strategy: Strategy;
  selector?: string;
  inStockRule: InStockRule;
  alertOn: AlertOn;
  keywords?: string[];
  excludeKeywords?: string[];
  sellerMustContain?: string;
  priceGuard?: boolean; // Pro: only alert restocks at or below the target price
  variantId?: string; // Shopify variant to watch
  currencyHint?: string;
  intervalSec: number;
  priority: Priority;
  quietHours?: QuietHours;
  boost?: BoostWindow;
  state: StockState;
  stableState: StableState;
  pausedReason?: "user" | "plan" | "queue" | "matched";
  evidence?: string;
  lastPrice?: Money;
  lastCheckedAt?: number;
  lastChangeAt?: number;
  consecutiveErrors: number;
  createdAt: number;
  // Simple Refresh only
  randomize?: boolean;
  hardRefresh?: boolean;
  keepScroll?: boolean;
  refreshCount?: number;
  /** Auto refresh page monitor: alert when this text appears / disappears. */
  watchText?: string;
  watchMode?: "appears" | "disappears";
}

/** Scheduler bookkeeping kept apart from the monitor so UI edits never race it. */
export interface MonitorRuntime {
  nextCheckAt: number;
  lastSuccessAt?: number;
  lastAttemptAt?: number;
  inFlightSince?: number;
  lastAlertAt: Record<string, number>;
  stalledNotifiedAt?: number;
  listingSeeded?: boolean;
  tabOpenedAt?: number;
  tabReloads?: number;
  backingOff?: boolean;
  skippedTyping?: number;
  textMisses?: number;
}

export interface DomainState {
  lastRequestAt: number;
  inFlightSince?: number;
  windowStart: number;
  windowCount: number;
  backoffUntil?: number;
}

export interface ListingProduct {
  id: string;
  title: string;
  url: string;
  price?: Money;
  available?: boolean;
}

export type HistoryEventType = "restock" | "preorder" | "out" | "price-drop" | "new-listing";

export interface HistoryEvent {
  monitorId: string;
  shopDomain: string;
  title: string;
  game?: GameTag;
  productType?: ProductTypeTag;
  event: HistoryEventType;
  at: number;
  price?: Money;
  latencyMs?: number;
}

export type AlertEvent = "restock" | "preorder" | "price-drop" | "new-listing" | "text-match" | "queue" | "stall" | "test";

export interface AlertRecord {
  id: string;
  monitorId: string;
  event: AlertEvent;
  title: string;
  shopDomain: string;
  url: string;
  at: number;
  latencyMs?: number;
  price?: Money;
  chromeFocused: boolean;
  clickedAt?: number;
  channels: string[];
  quiet?: boolean;
}

export type SoundId = "chime" | "ping" | "alarm";

/** Small preferences synced across the user's browsers. */
export interface Prefs {
  sound: SoundId;
  volume: number; // 0..1
  autoOpen: boolean;
  defaultIntervalSec: number;
}

/** Local-only settings, including private alert channels. */
export interface Settings {
  ntfyEnabled: boolean;
  ntfyTopic: string;
  ntfyServer: string;
  discordEnabled: boolean;
  discordWebhook: string;
  defaultQuietHours?: QuietHours;
  stallToPhone: boolean;
}

export type Plan = "free" | "trial" | "pro";

export interface EntitlementCache {
  plan: Plan;
  checkedAt: number;
  trialStartedAt?: number;
  paidAt?: number;
  email?: string | null;
  devOverride?: Plan;
}

export interface UiState {
  welcomePending: boolean;
  lastNudgeAt?: number;
  nudgedAlertIds: string[];
  needsChooseActive: boolean;
}

export interface Counters {
  monitorsByGame: Record<string, number>;
  alertsFired: number;
  proConversions: number;
}

export interface SimplePref {
  intervalSec: number;
  randomize: boolean;
  hardRefresh: boolean;
  keepScroll: boolean;
  watchText?: string;
  watchMode?: "appears" | "disappears";
}

export interface CheckResult {
  ok: boolean;
  state: StableState | "queue";
  price?: Money;
  seller?: string;
  variantTitle?: string;
  products?: ListingProduct[];
  evidence: string;
  httpStatus?: number;
  error?: string;
  skipped?: "typing" | "no-tab" | "no-permission";
  finalUrl?: string;
  checkedAt: number;
}

export interface Draft {
  id: string;
  kind: "product" | "listing";
  url: string;
  title: string;
  strategy: Strategy;
  selector?: string;
  game?: GameTag;
  productType?: ProductTypeTag;
  region?: string;
  alertOn: AlertOn;
  keywords?: string[];
  excludeKeywords?: string[];
  intervalSec: number;
  currencyHint?: string;
  variantId?: string;
  createdAt: number;
}
