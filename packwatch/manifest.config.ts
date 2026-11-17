import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest((env) => ({
  manifest_version: 3,
  name: "__MSG_extName__",
  short_name: "Packwatch",
  description: "__MSG_extDescription__",
  version: pkg.version,
  default_locale: "en",
  minimum_chrome_version: "116",
  icons: { 16: "icons/icon16.png", 32: "icons/icon32.png", 48: "icons/icon48.png", 128: "icons/icon128.png" },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Packwatch",
    default_icon: { 16: "icons/icon16.png", 32: "icons/icon32.png" },
  },
  background: { service_worker: "src/background/index.ts", type: "module" },
  options_page: "src/options/index.html",
  side_panel: { default_path: "src/sidepanel/index.html" },
  permissions: ["storage", "alarms", "notifications", "offscreen", "scripting", "activeTab", "tabs", "sidePanel"],
  optional_host_permissions: ["<all_urls>"],
  // Dev builds only: the local fixture shop (*.localhost) works without a permission prompt,
  // so automated tests can run. Store builds request each shop's permission at runtime.
  // PW_TEST_HOSTS="shop.example,other.example" adds real shops to a dev build for live backtests.
  ...(env.mode !== "production" ? { host_permissions: ["http://localhost/*", "http://*.localhost/*",
    ...(process.env.PW_TEST_HOSTS ?? "").split(",").filter(Boolean).map((h) => (h.includes("://") ? `${h.trim()}/*` : `https://${h.trim()}/*`))] } : {}),
  content_scripts: [
    // Required by ExtensionPay so onPaid / onTrialStarted reach the extension.
    { matches: ["https://extensionpay.com/*"], js: ["src/content/extpay.ts"], run_at: "document_start" },
  ],
  commands: {
    "toggle-refresh": {
      suggested_key: { default: "Alt+Shift+R" },
      description: "__MSG_cmdToggleRefresh__",
    },
  },
}));
