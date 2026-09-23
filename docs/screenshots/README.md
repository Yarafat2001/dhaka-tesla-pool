## Screenshots and how to regenerate them

The README's screenshot section expects four PNGs in `docs/screenshots/`. They
are captures of the running stack, never hand-drawn, so they cannot drift from
the code - and the two scripts in this folder are what produced them:
`seed-demo.js` runs the demo story through the API, `capture.js` signs in and
shoots the screens.

### Regenerating the committed four

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose down -v
docker compose up --build -d

# Puppeteer is installed ad hoc so it never slows down `docker compose build`
cd frontend && npm install --no-save puppeteer && cd ..

# the demo story the shots show: Nusrat opens a pool, Rafiq and Shirin fill
# Bullet's 3 seats, Jashim drives it to COMPLETED, one pool is left FORMING
node docs/screenshots/seed-demo.js
node docs/screenshots/capture.js
```

Both scripts read the stack's location from the environment, so a non-default API
port (the Windows override described in the root `.env.example`) is just:

```bash
API_URL=http://localhost:4100 node docs/screenshots/seed-demo.js
WEB_URL=http://localhost:3000 API_PORT=4100 node docs/screenshots/capture.js
```

`capture.js` captures in light theme, which is what the app serves by default
(`components/ThemeToggle`). For dark-mode copies of the same four screens:

```bash
DTP_THEME=dark OUT_DIR=docs/screenshots/dark node docs/screenshots/capture.js
```

That is what produced the committed `dark/01-login.png` ... `dark/04-driver.png`
copies; without `OUT_DIR` the script writes into this folder.

### What each shot shows

- `01-login.png` - the login screen with the **Quick fill the demo cast** select:
  Jashim, Nusrat, Rafiq, Shirin, all with password `password123`.
- `02-passenger.png` - Nusrat's screen: the live estimate (solo vs. sharing), her
  TeslaPay wallet after settlement, and her completed pooled ride.
- `03-ride-audit-trail.png` - that ride's "What happened on this ride?" expanded:
  `REQUESTED -> MATCHED -> DRIVER_ARRIVED -> STARTED -> COMPLETED` plus the
  settled TeslaPay payment.
- `04-driver.png` - Jashim's screen: Bullet's 3 seats, a pool waiting for
  `Accept pool`, and trip history with per-passenger method/status and earnings.

### Capturing manually instead

Any screenshot tool works (Win+Shift+S, macOS Cmd+Shift+4, or
`npx playwright screenshot`). Run `seed-demo.js` first, then sign in at
<http://localhost:3000> as Nusrat (`01710000002`) or Jashim (`01710000001`) with
password `password123` and capture the four screens listed above.

If you prefer a GIF for the README, record the 2-minute demo from the README's
Demo credentials section as a screen capture and drop it here as
`docs/screenshots/demo.gif`.

### A note on state

`seed-demo.js` is additive: it never deletes anything, it just runs the demo
story and prints what the API actually did (fares, payments, wallet balance,
earnings) so the numbers in the README stay checkable. Run it against a fresh
volume (`docker compose down -v`), otherwise rides from an earlier session appear
in the passenger and driver screens alongside the story ones and the shots stop
matching their captions.
