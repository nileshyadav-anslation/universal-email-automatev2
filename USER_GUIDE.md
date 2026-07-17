# Email Read Automate — User Guide by Nilesh

A Chrome extension that automatically opens and reads your unread emails, and can optionally
reply, click safe links, handle spam, switch between accounts, and run through a proxy. It works
with **Gmail, Yahoo, AOL, Outlook**.

It can run in two ways:

1. **Manual mode** — you open your mailbox, click **Start**, and the extension processes your unread emails.
2. **Inbox Lab mode (worker)** — the extension connects to a backend server. When the server sends a
   "job", the extension automatically runs it and reports the result back. Between jobs it stays idle.

---

## 1. What this extension does (in plain words)

When you press **Start** (or a job arrives from Inbox Lab), the extension:

1. Opens your mailbox and finds unread emails.
2. Opens each unread email one by one, like a human — with a reading pause on each.
3. Optionally clicks **safe links** inside the email.
4. Optionally sends a **template reply**.
5. Optionally moves spam email to the inbox (Gmail).
6. Remembers which emails it already processed, so it doesn't repeat them.
7. When finished, it goes back to **Idle** and waits for the next run.

It is designed to look like natural human activity: random-order opening, human-like clicks, reading
delays, and automatic pause when *you* start clicking or typing.

---

## 2. Installation

1. Download or clone this folder to your computer.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer Mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select this extension folder.
6. The extension icon appears in the toolbar. Click it to open the popup.

> After changing any code or settings file, return to `chrome://extensions` and click **Reload** on the extension.

---

## 3. Quick start (manual mode)

1. Open your mailbox in a tab (for example `mail.google.com`).
2. Click the extension icon to open the popup.
3. Under **Settings → Mail Provider**, tick the mailbox you want (e.g. Gmail).
4. Adjust the basic settings you care about (Reading Time, Total Emails Limit, Enable Link Opening, Enable Auto Reply).
5. Click **Start**.
6. Watch progress in **Session Stats** and the **Activity Log**.
7. Click **Stop** any time to end the run.

That's it — everything else below is optional fine-tuning.

---

## 4. The popup, section by section

### Automation Control
- **Start** — begins processing unread emails using your current settings.
- **Pause** — temporarily halts; **Resume** continues from where it stopped.
- **Stop** — ends the run completely.

### Session Stats
- **Opened** — how many emails were opened this session.
- **Runtime** — how long the current run has been going.
- **Unread** — unread count detected in the mailbox.

### Status pill (top-right)
Shows the overall state: **Idle**, **Running**, **Paused**, or **Stopped**.

---

## 5. Settings explained

### Mail Provider
Choose one or more mailboxes to automate (Gmail, Yahoo, AOL, Outlook). If you tick more than one,
the extension runs them in parallel in separate tabs.

### Backend Connector (Inbox Lab)
Connects the extension to the Inbox Lab backend so it can receive jobs automatically. Four fields:
- **Server/Base URL** — the backend API address.
- **Connector ID** — identifies this specific connector.
- **Token** — the secret key that authorizes this connector.
- **Account** — the email address this connector is registered to. This is used as the connector's
  **identity and for reporting** — it does *not* by itself decide which mailbox gets automated (the
  job decides that).

Click **Connect/Test** to verify. On success the status shows **Online** and the **Worker** row
starts showing **Idle**. See Section 7 for how the worker behaves.

### Automation Templates
Save the current set of settings as a named template (e.g. "Open Only", "Open + Links", "Reply mode")
and re-apply it later with one click. Useful for switching between workflows quickly.

### Reading & timing
- **Reading Time** — seconds spent on each opened email (simulates reading).
- **Next Email Delay** — pause before opening the next email.
- **Total Emails Limit** — maximum number of emails to process in one run.
- **Auto Refresh** — refresh the inbox between cycles so new mail is picked up.

### Continuous Mode
- **Continuous Mode** — after finishing a run, automatically start another one after a delay.
- **Loop Delay** — minutes to wait before the next cycle. Runs on a Chrome alarm so it survives
  even if Chrome puts the extension to sleep.

### Human-like behavior
- **Random Email Opening** — open unread emails in a random order instead of top-to-bottom.
- **Retry Failed Opens** — if an email fails to open, retry up to 3 times.
- **Manual Activity Pause** — if *you* click or type in the tab, the automation pauses briefly so
  it doesn't fight with you.

### Gmail-specific
- **Gmail Promotions** — also process the Promotions category during automation.
- **Promotions Pages** — how many Promotions pages to go through per account.
- (Gmail also checks **Spam first, then Inbox**, and can move safe spam email to the inbox.)

### Account Switching
- **Enable Account Switching** — process several logged-in accounts one at a time.
- **Accounts** — only the accounts you tick take part. Use **Refresh** / **Deep Scan** to discover
  the accounts you're signed into.

### Proxy (advanced)
Routes traffic through a proxy while automating. **Note: `chrome.proxy` applies to the whole browser,
not just one tab** — while a proxy is active, your other browsing goes through it too.
- **Enable Proxy Manager** — apply an assigned proxy before each account scan.
- **Proxy Fallback** — if the assigned proxy fails, allow automation to continue *without* a proxy
  (turn off if you never want to run un-proxied).
- **Proxy Apply Mode** — how the proxy is chosen (off / per-account / same global proxy).
- **Global Proxy** — the single proxy used by all tabs in "same proxy" mode.
- **Proxy List** — add proxies (host, port, username, password) and assign up to 3 to one account.
  The extension verifies the proxy's real IP before using it, and tries the next one if it fails.

### Links & replies
- **Enable Link Opening** — open safe links found inside emails.
- **Max Links Per Email** — how many safe links to open per email.
- **Enable Auto Reply** — send a template reply after processing an email.
- **Reply Templates** — one reply per line; leave empty to use built-in defaults.

### Processed history
- **Processed Tracking** — skip emails already processed in earlier runs.
- **Reprocessing Mode** — control whether/when already-processed unread emails can be handled again.
- **Processed History** — clear the saved records and in-memory caches (start fresh).

### Activity Log
- Shows what the extension is doing, newest first.
- **Export** — download the full log as a `.txt` file.
- **Clear Log** — delete all saved logs.
- **Load older logs** — page back through history (kept for about 7 days / ~5000 entries).

---

## 6. Manual mode vs. Inbox Lab (worker) mode

| | Manual mode | Inbox Lab (worker) mode |
|---|---|---|
| How it starts | You click **Start** | Backend sends a job |
| What it processes | Whatever unread mail matches your settings | The specific email/account named in the job |
| When it stops | You click **Stop**, or the limit is reached | When the job is done, then goes back to Idle |
| Reporting | Local activity log only | Result (completed/failed) posted back to the backend |

Both modes share the same underlying automation, and they don't run at the same time — if a manual
run is active, the worker waits.

---

## 7. How the Inbox Lab worker works

After you **Connect/Test** successfully, the extension runs a background worker:

1. **Idle** — every few seconds it asks the backend "any job for me?"
2. **Job received** — it figures out the provider/account, switches to the right account if needed,
   opens the target email, optionally clicks a link, and reports the result.
3. **Complete** — it posts the result (completed or failed, with details) back to the backend and
   returns to **Idle**, ready for the next job.

**Reliability built in:**
- A watchdog alarm wakes the worker if Chrome ever suspends the extension, so polling never dies
  silently while the browser is open.
- If posting a result fails (network/server error), the result is queued and retried automatically,
  so a finished job is never lost.

**Timing — how fast a job starts:**
- If the extension is active: about **5–15 seconds** after the job is available.
- If Chrome had put the extension to sleep: worst case about **35–45 seconds** (the watchdog wakes it).
- If the **browser is fully closed**: nothing runs until you reopen it — then the worker resumes on
  its own (no need to reconnect).

The **Worker** status row shows: Disconnected, Connecting, Idle, Running, Paused, or Stopped.

---

## 8. Tips & troubleshooting

- **Nothing happens on Start** — make sure a supported mailbox tab is open and you're logged in.
- **Worker stuck on Disconnected** — re-run **Connect/Test**; check the Server URL, Connector ID,
  and Token are correct and the backend is reachable.
- **Jobs not picked up** — the browser must be open. Keep at least one Chrome window running.
- **Account switching does nothing** — click **Refresh** / **Deep Scan** first so the extension can
  discover your signed-in accounts, then tick the ones you want.
- **Proxy errors** — use **Test** on each proxy; the extension verifies the real IP before using it.
  If you want runs to stop rather than go un-proxied, turn **Proxy Fallback** off.
- **Emails being skipped** — that's **Processed Tracking** doing its job. Use **Clear Processed
  History** or adjust **Reprocessing Mode** to reprocess them.
- **Can't see old logs** — use **Load older logs**, or **Export** to get the full history as a file.

---

## 9. Important notes

- Use this only on accounts you own or are authorized to access.
- The proxy applies to your whole browser while active, not just the automation tab.
- Backend Token and Connector details are sensitive — treat them like a password and don't share them.
