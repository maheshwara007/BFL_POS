import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.resolve(process.cwd(), 'reports/exchange-sale-api-log.json');

export interface ApiCallEntry {
  testName: string;
  endpoint: string;
  httpStatus: number;
  request: object;
  response: object;
}

// Called from jest.global-setup to clear the log at the start of a full run
export function clearApiLog(): void {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.writeFileSync(LOG_FILE, '[]', 'utf8');
}

// Called from each spec's beforeAll — creates the file if absent but does NOT reset it,
// so multiple spec files accumulate into the same log for a combined report
export function initApiLog(): void {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '[]', 'utf8');
  }
}

export function appendApiLog(entry: ApiCallEntry): void {
  let entries: ApiCallEntry[] = [];
  try { entries = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch { /* empty */ }
  entries.push(entry);
  fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

export function generateApiHtmlReport(): void {
  let entries: ApiCallEntry[] = [];
  try { entries = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch { return; }

  // Group calls by test name
  const grouped = new Map<string, ApiCallEntry[]>();
  for (const e of entries) {
    if (!grouped.has(e.testName)) grouped.set(e.testName, []);
    grouped.get(e.testName)!.push(e);
  }

  const statusBadge = (s: number) =>
    `<span class="badge ${s >= 200 && s < 300 ? 'ok' : 'fail'}">HTTP ${s}</span>`;

  const testBlocks = [...grouped.entries()].map(([testName, calls]) => {
    const callsHtml = calls.map((c, i) => `
      <div class="call">
        <div class="call-header">
          <span class="method">POST</span>
          <span class="endpoint">${c.endpoint}</span>
          ${statusBadge(c.httpStatus)}
        </div>
        <div class="panels">
          <div class="panel">
            <div class="panel-title">Request Sent</div>
            <pre>${JSON.stringify(c.request, null, 2)}</pre>
          </div>
          <div class="panel">
            <div class="panel-title">Response Received</div>
            <pre>${JSON.stringify(c.response, null, 2)}</pre>
          </div>
        </div>
      </div>`).join('');

    return `
    <details class="test-block" open>
      <summary class="test-name">${testName}</summary>
      <div class="calls">${callsHtml}</div>
    </details>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Exchange Sale API — Request / Response Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f2f5; color: #222; }
  header { background: #1a237e; color: #fff; padding: 20px 32px; }
  header h1 { font-size: 1.4rem; font-weight: 600; }
  header p  { font-size: 0.85rem; opacity: 0.75; margin-top: 4px; }
  main { max-width: 1400px; margin: 24px auto; padding: 0 24px; }
  .test-block { background: #fff; border-radius: 8px; margin-bottom: 16px;
                box-shadow: 0 1px 4px rgba(0,0,0,.08); overflow: hidden; }
  .test-name { font-size: 0.92rem; font-weight: 600; padding: 14px 18px;
               cursor: pointer; background: #e8eaf6; list-style: none;
               border-left: 4px solid #3949ab; }
  .test-name::-webkit-details-marker { display: none; }
  .calls { padding: 0 18px 18px; }
  .call { margin-top: 14px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }
  .call-header { display: flex; align-items: center; gap: 10px; padding: 9px 14px;
                 background: #f5f5f5; border-bottom: 1px solid #e0e0e0; font-size: 0.83rem; }
  .method   { background: #283593; color: #fff; padding: 2px 7px; border-radius: 3px;
              font-weight: 700; font-size: 0.75rem; letter-spacing: .5px; }
  .endpoint { font-family: monospace; color: #37474f; flex: 1; }
  .badge    { padding: 2px 8px; border-radius: 3px; font-size: 0.75rem; font-weight: 600; }
  .badge.ok   { background: #e8f5e9; color: #2e7d32; }
  .badge.fail { background: #ffebee; color: #c62828; }
  .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .panel  { padding: 12px 14px; border-right: 1px solid #e0e0e0; }
  .panel:last-child { border-right: none; }
  .panel-title { font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
                 letter-spacing: .7px; color: #757575; margin-bottom: 8px; }
  pre { font-family: 'Cascadia Code', 'Consolas', monospace; font-size: 0.75rem;
        white-space: pre-wrap; word-break: break-all; line-height: 1.5;
        background: #fafafa; padding: 10px; border-radius: 4px;
        border: 1px solid #eeeeee; max-height: 420px; overflow-y: auto; color: #263238; }
  .stats { background: #fff; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px;
           box-shadow: 0 1px 4px rgba(0,0,0,.08); font-size: 0.85rem; color: #555; }
  .stats span { font-weight: 700; color: #1a237e; }
</style>
</head>
<body>
<header>
  <h1>Exchange Sale API — Request / Response Report</h1>
  <p>Generated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)}</p>
</header>
<main>
  <div class="stats">
    <span>${grouped.size}</span> tests &nbsp;|&nbsp;
    <span>${entries.length}</span> API calls logged
  </div>
  ${testBlocks}
</main>
</body>
</html>`;

  const outPath = path.resolve(process.cwd(), 'reports/exchange-sale-api-report.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`[ApiReport] Detailed report → ${outPath}`);
}
