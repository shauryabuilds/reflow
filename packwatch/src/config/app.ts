// App-wide configuration. Change values here, not in logic.
export const APP = {
  /** ExtensionPay extension id (register at extensionpay.com, then put the id here). */
  EXTPAY_ID: "packwatch",
  /** Feedback form opened after uninstall. Empty string disables it. */
  UNINSTALL_URL: "",
  NTFY_SERVER: "https://ntfy.sh",
  ALERT_COOLDOWN_MS: 10 * 60_000,
  STALE_FACTOR: 3,
  MAX_BACKOFF_SEC: 15 * 60,
  TAB_RECYCLE_MS: 2 * 60 * 60_000,
  TAB_RECYCLE_RELOADS: 400,
  TYPING_GUARD_MS: 10_000,
  HISTORY_CAP: 5000,
  ALERT_LOG_CAP: 300,
  SEEN_CAP: 3000,
  FREE_HISTORY_DAYS: 7,
  NUDGE_UNCLICKED_MS: 2 * 60_000,
  IN_FLIGHT_TIMEOUT_MS: 90_000,
  FREE_MONITOR_LIMIT: 3,
  SIMPLE_MIN_SEC: 5,
  TRIAL_DAYS: 7,
} as const;

/** Minimum check intervals per plan and mode (seconds). */
export const MIN_INTERVAL = {
  free: { fetch: 60, tab: 60 },
  pro: { fetch: 15, tab: 30 },
} as const;

export const INTERVAL_CHOICES = [15, 30, 60, 120, 300, 600, 1800] as const;
