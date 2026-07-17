/**
 * Build a styled PDF from an incident markdown file.
 * Usage: node scripts/build-incident-pdf.js <path-to-md>
 * Renders with the locally installed Chrome via Playwright (channel: "chrome").
 */
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");
const { chromium } = require("playwright");

async function main() {
  const mdPath = path.resolve(process.argv[2]);
  if (!fs.existsSync(mdPath)) throw new Error("Markdown not found: " + mdPath);

  const dir = path.dirname(mdPath);
  const base = path.basename(mdPath, ".md");
  const md = fs.readFileSync(mdPath, "utf8");
  const bodyHtml = marked.parse(md, { mangle: false, headerIds: true });

  const css = `
    :root { --ink:#1a1c23; --muted:#5b6472; --line:#dfe3ea; --brand:#e11d48; --soft:#f7f8fa; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
           color: var(--ink); font-size: 11.5px; line-height: 1.55; margin: 0; }
    .wrap { padding: 4px 2px; }
    h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); line-height: 1.2; }
    h2 { font-size: 15px; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 2px solid var(--brand);
         color: var(--ink); break-after: avoid; }
    h3 { font-size: 12.5px; margin: 14px 0 6px; color: var(--brand); break-after: avoid; }
    p { margin: 6px 0; }
    a { color: #1d4ed8; text-decoration: none; word-break: break-all; }
    strong { color: var(--ink); }
    hr { border: none; border-top: 1px solid var(--line); margin: 16px 0; }
    ul, ol { margin: 6px 0 6px 18px; padding: 0; }
    li { margin: 3px 0; }
    code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
           background: var(--soft); border: 1px solid var(--line); border-radius: 4px;
           padding: 0.5px 4px; font-size: 10.5px; }
    blockquote { margin: 8px 0; padding: 7px 12px; background: #fff8f0; border-left: 3px solid #e0a800;
                 color: #6b5300; border-radius: 4px; font-size: 10.8px; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 10.6px; }
    th, td { border: 1px solid var(--line); padding: 5px 8px; text-align: left; vertical-align: top;
             word-break: normal; }
    th { background: var(--soft); font-weight: 600; }
    tr { break-inside: avoid; }
    tbody tr:nth-child(even) { background: #fbfcfd; }
    img { max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 6px; margin: 8px 0;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    /* Title metadata block */
    table.docmeta { border: 1px solid var(--line); border-radius: 6px; overflow: hidden; margin: 10px 0 4px;
                    font-size: 10.6px; width: 100%; }
    table.docmeta tr { background: transparent; break-inside: avoid; }
    table.docmeta td { border: none; border-bottom: 1px solid #eef1f5; padding: 5px 11px; vertical-align: top; }
    table.docmeta tr:last-child td { border-bottom: none; }
    table.docmeta td:first-child { width: 132px; background: var(--soft); color: var(--muted);
                                   font-weight: 600; white-space: nowrap; }
    table.docmeta code { background: #eef1f5; border-color: #e2e6ec; }
    h2, h3 { break-inside: avoid; }
    /* First H1 = title block accent */
    .wrap > h1:first-child { border-bottom: 3px solid var(--brand); padding-bottom: 8px; }
  `;

  const html = `<!doctype html><html><head><meta charset="utf-8">
    <style>${css}</style></head>
    <body><div class="wrap">${bodyHtml}</div></body></html>`;

  const htmlPath = path.join(dir, `_${base}.render.html`);
  fs.writeFileSync(htmlPath, html, "utf8");

  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();
  await page.goto("file://" + htmlPath.replace(/\\/g, "/"), { waitUntil: "networkidle" });
  const pdfPath = path.join(dir, `${base}.pdf`);
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#8a92a0;padding:0 14mm;display:flex;justify-content:space-between;">' +
      '<span>CONFIDENTIAL — Internal incident report · SB-IHF-20270319-FM012</span>' +
      '<span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  });
  // Optional: emit a PNG preview of the title/meta area for a quick visual check.
  if (process.argv.includes("--preview")) {
    const previewPath = path.join(dir, "assets", "_header-preview.png");
    await page.setViewportSize({ width: 900, height: 700 });
    await page.screenshot({ path: previewPath, clip: { x: 0, y: 0, width: 900, height: 360 } });
    console.log("Preview written: " + previewPath);
  }

  await browser.close();
  fs.unlinkSync(htmlPath);
  console.log("PDF written: " + pdfPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
