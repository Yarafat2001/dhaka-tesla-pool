## Screenshots and how to regenerate them

The README's screenshot table expects four PNGs in `docs/screenshots/`. They are
captured from the running stack, never hand-drawn, so they cannot drift from the
code - and `capture.js` in this folder is the script that produced them.

### Automated capture (what produced the committed PNGs)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up --build -d

# Puppeteer is installed ad hoc so it never slows down `docker compose build`
cd frontend && npm install --no-save puppeteer && cd ..
node docs/screenshots/capture.js
```

If your stack publishes the API somewhere other than `:4000` - for example the
Windows port-override described in the root `.env.example` - tell the script:

```bash
WEB_URL=http://localhost:3000 API_PORT=4100 node docs/screenshots/capture.js
```

The script signs in with the demo credentials from the README (`Nusrat
01710000002`, `Jashim 01710000001`; password `password123`) and captures, in
this order, so each shot tells the story:

- `01-login.png` - the login screen, showing the seeded cast for the evaluator.
- `02-passenger.png` - Nusrat's screen: the live estimate (solo vs. shared), the
  payment method, her TeslaPay wallet, and her ride list.
- `03-ride-audit-trail.png` - Nusrat's finished ride with "What happened on this
  ride?" expanded: `REQUESTED -> MATCHED -> DRIVER_ARRIVED -> STARTED ->
  COMPLETED` plus the settled TeslaPay payment.
- `04-driver.png` - Jashim's screen: Bullet's 3 seats, a pool waiting for
  `Accept pool`, and trip history with per-passenger method/status and earnings.

### Capturing manually instead

Any screenshot tool works (Win+Shift+S, macOS Cmd+Shift+4, or
`npx playwright screenshot`). Sign in at <http://localhost:3000> with the
credentials above and capture the four screens listed above.

If you prefer a GIF for the README, record the 2-minute demo from the README's
Demo credentials section as a screen capture and drop it here as
`docs/screenshots/demo.gif`.

### A note on state

These are captures of whatever was in the database at the time, so a fresh
`docker compose down -v && docker compose up -d` produces emptier screens than
the committed ones. To reproduce the committed shots, run the 2-minute demo
first (Nusrat requests, Rafiq pools in, Jashim accepts/arrives/starts/completes)
and leave one pool waiting for acceptance - which is exactly what the committed
`04-driver.png` shows.
