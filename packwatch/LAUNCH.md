# Launch checklist: test locally, then publish

Follow these in order. Part C takes about 30 minutes; the whole list about an afternoon, mostly waiting for the store review.

## A. Get it running on your computer (once)

1. Install **Node.js 20 or newer** from https://nodejs.org (the LTS button is fine).
2. Get the latest code into your `kaizenlabs` folder:
   ```bash
   cd ~/kaizenlabs
   git clone -b claude/fervent-brahmagupta-4fjzwg https://github.com/shauryabuilds/reflow.git packwatch-src
   cd packwatch-src/packwatch
   ```
   Already cloned? Run `git pull` in that folder instead.
3. Install and build the **test build** (includes the plan switcher and test-shop access):
   ```bash
   npm install
   npm run build:dev
   ```

## B. Load the unpacked extension in Chrome

1. Open `chrome://extensions` and switch on **Developer mode** (top right).
2. If the store version of **Reflow** is installed, switch it **off** while you test, so you don't have two icons.
3. Click **Load unpacked** and choose the `packwatch/dist-dev` folder.
4. Click the puzzle icon in the toolbar and **pin Packwatch**.
5. After any code change: run `npm run build:dev` again, then click the **↻ reload** icon on the Packwatch card in `chrome://extensions`.
6. To remove it later: click **Remove** on that card. Nothing else on your computer changes.

## C. Test it (about 30 minutes)

Start the local test shop in a second terminal and leave it running:

```bash
npm run fixture-shop
```

It runs at `http://shop-a.localhost:8787/`. Every `something.localhost` address is a separate fake shop. To change stock, open a control link in a new tab, for example:

```text
http://localhost:8787/__control/set?host=shop-a.localhost&handle=elite-trainer-box&state=in
```

Use `state=out` to sell it out again, and `state=preorder` for preorders.

Work through this list and tick each item:

- [ ] **Watch a product.** Open `http://shop-a.localhost:8787/products/elite-trainer-box`, click the Packwatch icon, then **Watch this product**. You should see "Now watching".
- [ ] **Restock alert.** Open the control link above with `state=in`. Within about a minute you get a desktop notification with a sound. Clicking it opens the product.
- [ ] **No duplicate alerts.** Leave it in stock for 3 more minutes: no second alert.
- [ ] **New listings.** Open `http://shop-b.localhost:8787/collections/one-piece`, type `OP-15`, then click **Watch for new listings**. Next, open `http://localhost:8787/__control/add?host=shop-b.localhost&collection=one-piece&title=OP-15%20Booster%20Box`. You get one alert naming the new box.
- [ ] **Point at the stock button.** Open `http://shop-c.localhost:8787/plain/ygo-tin`, open **More options**, click **Pick the stock button instead**, then click the "Sold out" button on the page. A dark bar confirms "Packwatch is watching this element".
- [ ] **Auto refresh with a text alert.** Open `http://shop-d.localhost:8787/plain/tin`.
  - Open the **Auto refresh** tab, type `Add to cart`, keep "appears", and tap **10 sec**.
  - Open the control link with `host=shop-d.localhost&handle=tin&state=in`.
  - You get an alert "Found “Add to cart”", refreshing stops, and the words are highlighted.
- [ ] **Typing guard.** Start Auto refresh on a page and type into the "Note to seller" box. The countdown keeps waiting instead of refreshing.
- [ ] **Queue guard.** Open `http://shop-e.localhost:8787/queue` and start Auto refresh. It stops at once and tells you you're in a queue.
- [ ] **Side panel.** Click **Monitors** in the popup.
  - Everything is listed, grouped by game, each with "checked Xs ago".
  - Try Pause, Check now, Edit and Delete.
  - Click **Test alert**.
- [ ] **Free vs Pro.** Open the gear icon (Settings), then **Plan → Dev build: simulate plan**.
  - **Free:** a 4th watch opens the upgrade sheet, and Pro features show a PRO chip.
  - **Pro:** 15-second checks, price alerts and phone/Discord unlock.
  - Switch back to **Free**: nothing is deleted, and you're asked which 3 monitors stay active.
- [ ] **Phone alerts (Pro).** In Settings → Phone alerts, switch it on, install the free **ntfy** app on your phone, and scan the QR code. Then click **Send a test alert**: it arrives on your phone.
- [ ] **Real shops.** Repeat "Watch a product" on 2–3 real shops you actually buy from: one product page and one collection page. Chrome asks "Allow Packwatch to read and change data on <shop>?": click **Allow**. Check that the stock and price shown are right.
- [ ] **Restart.** Quit Chrome completely, then reopen it. Within a minute the monitors show fresh "checked Xs ago" times, without pressing anything.
- [ ] **Reflow users upgrading.** This simulates what existing users will see:
  1. Load the old `reflow-repo/extension` folder unpacked, and start an auto-refresh on any site.
  2. Copy everything from `packwatch/dist-dev` into that same `reflow-repo/extension` folder, replacing what's there.
  3. Click **↻ reload** on its card.
  4. Open the popup: the "Reflow is now Packwatch" card appears, and your Auto refresh settings are still there.
  5. Afterwards, restore the folder with `git checkout reflow-repo/extension`.

Optional automated checks (each prints PASS/FAIL):

```bash
npm test
npm run test:e2e
npm run test:monitor
npm run test:restart
```

## D. Prepare the store version

1. **Payments (ExtensionPay).** Until this is done, Pro can't be bought, and everyone stays on Free.
   1. Create an account at https://extensionpay.com and add the extension.
   2. Put the extension's ExtensionPay ID in `src/config/app.ts` (`EXTPAY_ID`).
   3. Create two plans with exactly these nicknames: `pro-monthly` ($7.99/month) and `pro-annual` ($59.99/year).
   4. Connect Stripe, and use ExtensionPay's test mode to buy once yourself.
   5. Check ExtensionPay's licence terms (its files say LGPL-3.0, but a code comment says AGPLv3).
2. **Privacy policy.**
   1. In the GitHub repo, go to Settings → Pages → Deploy from a branch → `main` / `(root)`. Merge this branch into `main` first.
   2. Your policy will be at `https://shauryabuilds.github.io/reflow/packwatch/PRIVACY.html`. Open it to check it loads.
3. **Optional:** put a feedback-form link in `UNINSTALL_URL` in `src/config/app.ts`.
4. **Build the store zip:**
   ```bash
   npm run zip
   ```
   This creates `packwatch-3.0.0.zip`. It refuses to run if the build is a test build.
5. **Test the zip itself.**
   1. Unzip it into a new folder and load that folder unpacked (switch the dev copy off).
   2. Check there is **no** "Dev build" section in Settings.
   3. Adding a monitor on a shop shows Chrome's permission prompt.

## E. Upload to the Chrome Web Store

1. Go to https://chrome.google.com/webstore/devconsole and open your **existing Reflow item**. Don't create a new item: updating Reflow keeps its users, reviews and link.
2. **Package tab → Upload new package** and choose `packwatch-3.0.0.zip`. The version (3.0.0) is higher than Reflow's, so it's accepted as an update.
3. **Store listing tab:**
   - Paste the long description from `STORE_LISTING.md`. The name and short description come from the zip automatically.
   - Delete the old Reflow screenshots.
   - Upload, in order, `store-assets/screenshot-1-watch.png` … `screenshot-5-pro.png`.
   - Upload `promo-small-440x280.png`, `promo-marquee-1400x560.png` and `store-icon-128.png`.
4. **Privacy tab:**
   - Replace the single-purpose text and every permission justification with the ones in `STORE_LISTING.md`. There are new boxes for `offscreen`, `sidePanel` and `activeTab`, and the host-permission box now explains per-shop access.
   - Paste the privacy policy URL from step D2.
   - Remote code: **No**.
5. **Distribution:** Public, all regions.
6. **Submit for review.** Expect a few days, possibly longer, because the permissions and description changed and payments are new.
7. If you still have a never-published draft from earlier, delete it so you don't have two Reflow-like items.

## F. After it's live

- Existing Reflow users update automatically within a day or two and see the welcome card. Packwatch asks for *fewer* site permissions than Reflow did, so Chrome shouldn't disable it for them.
- Install it from the store yourself and repeat the first two checks in part C on a real shop.
- Your ExtensionPay dashboard shows trials and paid users. Settings → Your stats shows the counts on your own browser.
- If the review is rejected, paste the reason into a new session: most rejections are fixed with wording changes in the Privacy tab.
