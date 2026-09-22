/**
 * Captures the four README screenshots from a running stack.
 *
 * The screenshots in this folder are real captures of the running app, never
 * mockups, and this script is what produced them - so they can always be
 * regenerated against the current code instead of silently going stale.
 *
 * Usage (with `docker compose up --build` already running):
 *
 *   cd frontend && npm install --no-save puppeteer && cd ..
 *   node docs/screenshots/capture.js
 *
 * Puppeteer is installed ad hoc on purpose: it downloads a Chromium build, and
 * shipping that as a dependency of either app would slow down every
 * `docker compose build` for the sake of a docs script.
 *
 * Override the targets if the stack runs elsewhere (e.g. a non-default API
 * port, see the root `.env.example`):
 *
 *   WEB_URL=http://localhost:3000 API_PORT=4100 node docs/screenshots/capture.js
 */
const path = require('path');

const OUT = __dirname;
const WEB = process.env.WEB_URL || 'http://localhost:3000';
const API_PORT = process.env.API_PORT || '4000';

// `--no-save` installs land next to whichever package.json was used, so look in
// the app folders too rather than assuming the repo root.
function loadPuppeteer() {
  const candidates = [
    'puppeteer',
    path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'puppeteer'),
    path.join(__dirname, '..', '..', 'backend', 'node_modules', 'puppeteer'),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (err) {
      /* try the next location */
    }
  }
  throw new Error(
    'puppeteer not found. Run `cd frontend && npm install --no-save puppeteer` first.',
  );
}

const puppeteer = loadPuppeteer();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function fill(page, selector, value) {
  const el = await page.$(selector);
  await el.click();
  // Both fields are pre-filled with a demo default, so clear them explicitly -
  // a triple-click select-all does not reliably clear a React controlled input.
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await el.type(value);
}

/**
 * `/login` navigates with `router.push`, which is client-side, so there is no
 * document navigation to wait for - wait on the resulting route instead.
 */
async function signIn(page, phone, expectedPath) {
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle0' });
  await fill(page, '#phone', phone);
  await fill(page, '#password', 'password123');
  await page.click('button[type=submit]');
  await page.waitForFunction((p) => location.pathname === p, { timeout: 20000 }, expectedPath);
  await wait(1800); // let the data fetches settle before capturing
}

async function clickByText(page, text) {
  const clicked = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t));
    if (!btn) return false;
    btn.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`No button containing "${text}"`);
  await wait(1500);
}

async function signOut(page) {
  await clickByText(page, 'Sign out');
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 20000 });
  await wait(800);
}

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 1.5 });

  console.log(`web: ${WEB} (api expected on :${API_PORT})`);
  console.log('1/4 login screen');
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT, '01-login.png') });

  console.log("2/4 Nusrat's passenger screen");
  await signIn(page, '01710000002', '/passenger');
  await page.screenshot({ path: path.join(OUT, '02-passenger.png'), fullPage: true });

  console.log('3/4 audit trail');
  await clickByText(page, 'What happened on this ride?');
  await page.screenshot({ path: path.join(OUT, '03-ride-audit-trail.png'), fullPage: true });

  console.log("4/4 Jashim's driver screen");
  await signOut(page);
  await signIn(page, '01710000001', '/driver');
  await page.screenshot({ path: path.join(OUT, '04-driver.png'), fullPage: true });

  await browser.close();
  console.log('screenshots written to', OUT);
})().catch((err) => {
  console.error('capture failed:', err.message);
  console.error('Is the stack running (`docker compose up -d`) and seeded?');
  process.exit(1);
});
