# Launcher

Opens every Chrome profile that runs Email Read Automate when you log in to
Windows, so no one has to open each popup and press Start.

It takes two parts, because neither can do the whole job alone:

- **This launcher (Windows)** opens all the Chrome profiles at once. An
  extension can't start Chrome or open another profile by itself.
- **Auto-start (the extension)** starts the automation once its profile is open.
  Each profile has its own setting, and it is on by default.

Manual Start, Pause and Stop work exactly as before.

## One-time setup

1. **In each Chrome profile you want automated:** load this extension from this
   folder (`chrome://extensions` → Load unpacked), open the popup, choose the
   providers and accounts, and check that **Auto-start** is on under
   *Customize → Automation Timing* (it is by default). Switch on **Continuous Mode** as well if the
   profile should keep checking for new mail after the first run.

2. **Find the profiles.** From the repo folder:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\launcher\Start-EmailAutomate.ps1 -Discover
   ```

   This writes `launcher\profiles.json` listing only the profiles that have the
   extension installed. Profiles without it, such as personal ones, are never
   opened. Set `"enabled": false` on any profile you want to leave out.

   You can skip this step: if `profiles.json` doesn't exist yet when the
   launcher runs, it finds the profiles and creates the file itself. Run
   `-Discover` yourself to check the list first, or after you add the extension
   to more profiles.

3. **Check what it will do.** Nothing is launched:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\launcher\Start-EmailAutomate.ps1 -DryRun
   ```

4. **Run it at every logon:**

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\launcher\Start-EmailAutomate.ps1 -InstallTask
   ```

   Remove it later with `-UninstallTask`.

`-ExecutionPolicy Bypass` applies only to that one command. It doesn't change
your system's PowerShell policy.

## What happens at logon

Windows logs in → the launcher waits `initialDelaySeconds` → it opens every
enabled profile at the same time → each profile's extension waits a random
30–60 seconds, then starts its own automation.

If `profiles.json` doesn't exist yet, or lists no profiles, the launcher first
finds the profiles that have the extension and creates it.

If a start fails (usually because Wi-Fi isn't connected yet right after boot),
the extension tries again twice, 2 minutes apart. Every step is recorded in the
popup's Activity Log with an `[AutoStart]` prefix.

## profiles.json

| Key | Default | What it does |
|---|---|---|
| `initialDelaySeconds` | 30 | Wait after logon before opening anything |
| `staggerSeconds` | 0 | `0` opens every profile together. Set a number of seconds to open them one at a time instead |
| `disableBackgroundThrottling` | true | Stops Chrome from slowing down covered or minimised windows, which otherwise stalls automation you aren't watching |
| `profiles[].enabled` | true | Set to `false` to skip a profile |
| `profiles[].urls` | `[]` | Extra pages to open. The extension opens its own mail tabs, so this is usually empty |

Re-running `-Discover` keeps your `enabled` choices, URLs and settings, and adds
any profile that has installed the extension since. The launcher only looks for
profiles by itself when `profiles.json` is missing or empty, so run `-Discover`
after adding the extension to a new profile.

## Worth knowing

- **The throttling flags only work when this launcher is what starts Chrome.** If
  Chrome is already running, for example because *Settings → System → Continue
  running background apps when Google Chrome is closed* is on, the flags are
  ignored and the log says so. Turn that setting off.
- In each profile, add your mail sites under *Settings → Performance → Always
  keep these sites active*, so Memory Saver doesn't unload a mail tab mid-run.
- Set Windows to never sleep while this runs. Nothing runs while a laptop sleeps.
- Pressing **Stop** in a profile cancels that profile's pending auto-start for
  now. Auto-start stays on for the next time Chrome opens.
- To test Auto-start without logging out, fully exit Chrome (⋮ → Exit), then
  reopen the profile. Reloading the extension does not trigger it.
- When the launcher is what starts Chrome, the first profile gets a 3-second
  head start so Chrome is up before the rest open alongside it.
- Logs: `launcher\logs\launcher-<date>.log`.
