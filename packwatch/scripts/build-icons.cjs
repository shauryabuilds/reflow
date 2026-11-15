// Renders public/logo.svg to the PNG icon sizes. Usage: node scripts/build-icons.cjs
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, "../public/logo.svg"), "utf8");
  const b = await chromium.launch();
  for (const px of [16, 32, 48, 128]) {
    const p = await b.newPage({ viewport: { width: px, height: px } });
    await p.setContent(`<body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${px}" height="${px}" `)}</body>`);
    await p.screenshot({ path: path.join(__dirname, `../public/icons/icon${px}.png`), omitBackground: true });
    await p.close();
  }
  await b.close();
  console.log("icons written");
})();
