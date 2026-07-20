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

## 8. WarmTalk Feature

WarmTalk makes **your own enrolled accounts email each other** like real users, to warm up those
inboxes. It runs locally: the extension itself decides who emails whom, when, and what.

It is completely separate from Inbox Lab. WarmTalk and Inbox Lab never run at the same time — one
waits while the other works.

### What one WarmTalk conversation is

1. Account **A** opens Compose, types a subject and body like a human, and sends to account **B**.
2. After a random delay, account **B** opens its mailbox and finds that exact mail (using a unique
   tracking tag added to the subject, e.g. `[WT-A7F3K2]`).
3. If it landed in **Spam**, B marks it **Not spam** — this is the main point of warming.
4. B reads it for a random pause, then replies (based on your **Reply Probability**).
5. If **Threaded Conversation** is on, A then reads B's reply and answers back, and so on for as
   many **Thread Turns** as you set.
6. WarmTalk goes back to Idle and schedules the next conversation.

### First-time setup

1. In **Settings**, click **Deep Scan Gmail** / **Refresh Accounts** so the extension discovers your
   signed-in accounts. WarmTalk can only use accounts it has an email address for.
2. Open the **WarmTalk** card and turn on **Enable WarmTalk**.
3. Tick the **Providers** you want (Gmail, Yahoo, AOL, Outlook).
4. Under **Enrolled Accounts**, tick **at least 2** accounts. Only ticked accounts can send or
   receive.
5. **Leave Dry Run ON for the first test.**
6. Click **Save WarmTalk**, then **Start**.

### Dry Run — test safely first

With **Dry Run** ON, WarmTalk does everything *except* actually sending: it opens Compose, fills in
the recipient, subject, and body, then discards the draft. **No real email is sent.**

Watch the Activity Log. You should see `[WarmTalk] Composing...` then
`[WarmTalk] Dry run complete — draft discarded, nothing was sent.`

Once that looks right, turn **Dry Run OFF** and Start again to send for real.

### Settings

**Who takes part**

| Setting | What it does |
|---|---|
| **Dry Run** | Compose and discard, never send. Turn OFF to send real mail. |
| **Providers** | Which providers take part. |
| **Allow Cross-Provider** | Off = Gmail only talks to Gmail. On = Gmail can email Yahoo/AOL/Outlook. |
| **Enrolled Accounts** | The only accounts WarmTalk may use. Minimum 2. |

**How they pair up**

| Setting | What it does |
|---|---|
| **Round Robin** | Every account takes a turn as sender, in order. |
| **Random** | Sender and receiver picked at random each time. |
| **Mesh (all-to-all)** | Each sender talks to whichever partner it has contacted least recently, so every pair eventually exchanges mail. |
| **Manual Pairs** | You define exactly who emails whom (e.g. A always emails B). Add pairs with the two dropdowns. |
| **Threaded Conversation** | Instead of one email + one reply, keep volleying back and forth (A→B→A→B). More realistic. |
| **Thread Turns** | How many replies to volley per conversation. |

**Volume and timing**

| Setting | What it does |
|---|---|
| **Gap Between Conversations** | Random minutes between conversations (min, max). |
| **Reply Delay** | Random seconds before the receiver opens the mail (min, max). |
| **Read Time** | Random pause between opening a mail and replying (min, max). |
| **Daily Cap Per Account** | Max outbound mails per account per day. 0 = no cap. |
| **Weekly Cap Per Account** | Max outbound mails per account per week. 0 = no cap. |
| **Ramp-Up** | For cold/new accounts. Starts at a low daily volume and climbs to your daily cap over N days — the standard way to warm up without tripping spam filters. Day 1 begins the first time you press Start. |
| **Active Hours / Days** | WarmTalk only runs inside this window. |

**Content and behaviour**

| Setting | What it does |
|---|---|
| **Subject Templates** | One subject per line. A unique tracking tag is appended automatically. |
| **Body Templates** | Each body can be several lines. Separate one body from the next with a line containing only `---`. Line breaks and blank lines **inside** a body are kept and sent as-is. Empty uses the 10 built-in bodies. |
| **Template selection** | 10 subjects and 10 bodies ship by default. Subject and body are each picked at random every time, and never the same one twice in a row. |
| **Reply Probability** | % of mails that get a reply. Real users don't reply to everything. (Ignored inside a thread — an unanswered thread would just stop.) |
| **Click Links In Warmup Mail** | Opens safe links inside warmup mail, to simulate engagement. Only useful if your body templates contain links. |
| **Max Links Per Email** | How many safe links to open. |
| **Mark Not Spam** | Rescue warmup mail that lands in Spam. This is the main point of warming — leave it on. |

Note: replies count against the daily and weekly caps too, since a reply is outbound
mail from that account.

### Controls and stats

- **Start / Pause / Stop** control WarmTalk independently of the main automation.
- **Stats** shows per-account: sent, received, replied, spam rescued, failed.
- The **Status** row shows the live state, and tells you *why* it's waiting (for example
  `Idle — Waiting: outside active hours`).

### WarmTalk troubleshooting

- **Nothing happens after Start** — check the Status row. If it says *outside active hours* or
  *outside active days*, widen **Active Hours / Days**. The defaults are 9–18, Mon–Fri.
- **"Needs at least 2 enrolled accounts"** — run **Deep Scan** first, then tick 2+ accounts that
  show a real email address.
- **Accounts don't appear in the WarmTalk list** — WarmTalk only lists accounts whose email address
  it could detect. For Gmail, you can type the correct address into the account label in Settings.
- **Send fails** — the provider's Compose window may have changed, or you're signed out. The log
  names the exact step that failed (opening compose, To field, subject, body, or send).
- **Compose won't open on Yahoo / AOL / Outlook** — these don't have a reliably-labelled "Compose"
  button, so WarmTalk opens a new message with the **`n` keyboard shortcut**. That shortcut must be
  enabled in the mailbox:
  - **Yahoo / AOL**: Settings → keyboard shortcuts must be **on** (they are on by default).
  - **Outlook**: Settings → General → **Keyboard shortcuts** must be set to the **Outlook** scheme
    (the default), where `n` starts a new message.
  - **Gmail** uses its Compose button, and falls back to the `c` shortcut if keyboard shortcuts are
    enabled.
  If a provider's shortcut is off, WarmTalk still tries the on-screen button as a backup.
- **Mail never found by the receiver** — keep subject templates short. A long subject can push the
  tracking tag out of view.

---

## 9. Tips & troubleshooting

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

## 10. Important notes

- Use this only on accounts you own or are authorized to access.
- The proxy applies to your whole browser while active, not just the automation tab.
- Backend Token and Connector details are sensitive — treat them like a password and don't share them.
