## Screenshots and how to regenerate them

The README's screenshot table expects four PNGs in `docs/screenshots/`. They are
captured from the running stack (never hand-drawn), so they always match the
code:

1. `backend/.env` and `frontend/.env` created from the `.env.example` files.
2. `docker compose up --build`
3. Sign in at <http://localhost:3000> with the demo credentials from the README
   (`Jashim 01710000001`, `Nusrat 01710000002`, `Rafiq 01710000003`,
   `Shirin 01710000004`; password `password123`).
4. Capture, in this order, so each shot tells the story:
   - `01-login.png` — the login screen (shows the cast listed for the evaluator).
   - `02-passenger.png` — Nusrat's screen after choosing Banani → Mohakhali: the
     live estimate (solo vs. shared), payment method, wallet, and her ride list.
   - `03-ride-audit-trail.png` — Nusrat's ride with "What happened on this ride?"
     expanded, showing `MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED`.
   - `04-driver.png` — Jashim's screen: the pool with 3/3 seats and the action
     button for its current status, plus trip history with earnings.

Any screenshot tool works (Win+Shift+S, macOS ⌘⇧4, or `npx playwright screenshot`).
If you prefer a GIF for the README, record the 2-minute demo from the README's
Demo credentials section as a screen capture and drop it here as
`docs/screenshots/demo.gif`.