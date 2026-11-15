import { runMigrations } from "../shared/migrations";
import { getLocal, setLocal } from "../shared/storage";
import { APP } from "../config/app";

async function boot(reason: string, previousVersion?: string) {
  await runMigrations();
  // Upgrading from any Reflow release (1.x / 2.x) shows the one-time welcome card.
  if (reason === "update" && previousVersion && /^[12]\./.test(previousVersion)) {
    const ui = await getLocal("pw.ui");
    await setLocal({ "pw.ui": { ...ui, welcomePending: true } });
  }
  if (APP.UNINSTALL_URL) chrome.runtime.setUninstallURL(APP.UNINSTALL_URL).catch(() => {});
}

chrome.runtime.onInstalled.addListener((d) => { boot(d.reason, d.previousVersion); });
chrome.runtime.onStartup.addListener(() => { boot("startup"); });
