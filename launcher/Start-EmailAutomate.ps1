<#
.SYNOPSIS
  Opens every Chrome profile that has Email Read Automate installed, all at
  once, so each profile's extension can start its own automation.

.DESCRIPTION
  A Chrome extension cannot launch Chrome or open another profile - that has to
  happen from Windows. This script does only that part. Starting the automation
  is done by the extension itself, through each profile's "Auto-start" setting
  (on by default; Customize > Automation Timing in the popup).

  Modes:
    -Discover       Find profiles that have the extension and write profiles.json
    -DryRun         Show exactly what would be launched, without launching anything
    (no switch)     Launch the enabled profiles in profiles.json, creating it first if needed
    -InstallTask    Register a Windows task that runs this script at every logon
    -UninstallTask  Remove that task

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\launcher\Start-EmailAutomate.ps1 -Discover
#>
[CmdletBinding()]
param(
  [switch]$Discover,
  [switch]$DryRun,
  [switch]$InstallTask,
  [switch]$UninstallTask,
  [string]$ConfigPath = ''
)

$ErrorActionPreference = 'Stop'

$ExtensionName = 'Email Read Automate'
$TaskName = 'EmailReadAutomate-Launcher'
# $PSScriptRoot is empty inside a param() default in Windows PowerShell 5.1,
# so resolve the script's own location here instead.
$ScriptPath = $MyInvocation.MyCommand.Path
$ScriptDir = Split-Path -Parent $ScriptPath
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'profiles.json' }
$RepoRoot = Split-Path -Parent $ScriptDir
$LogDir = Join-Path $ScriptDir 'logs'

# Only used when this script is what starts Chrome. The first launch creates
# Chrome's main process and every other profile is handed to that process, so
# give it a moment to come up rather than have the launches race each other.
$ColdStartSettleSeconds = 3

# Chrome slows down windows that are covered, minimised or in the background.
# With several profile windows open at once, most of them are covered, and the
# automation's timers in those windows can slow to about one tick a minute.
$ThrottlingFlags = @(
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling'
)

function Write-Log {
  param([string]$Message, [string]$Level = 'INFO')

  $line = '[{0}] [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
  Write-Host $line

  # Only real launches are worth keeping a record of.
  if ($DryRun -or $Discover) { return }

  if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
  }
  $logFile = Join-Path $LogDir ('launcher-{0}.log' -f (Get-Date -Format 'yyyy-MM-dd'))
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

function Read-JsonFile {
  param([string]$Path)

  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $null }
  try {
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Get-IntSetting {
  param($Value, [int]$Default)

  if ($null -eq $Value -or "$Value" -eq '') { return $Default }
  return [int]$Value
}

function Find-ChromePath {
  $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA) | Where-Object { $_ }
  foreach ($root in $roots) {
    $candidate = Join-Path $root 'Google\Chrome\Application\chrome.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

# An unpacked extension is recorded in a profile's preferences with an absolute
# folder path. Match on the manifest's name rather than on one folder, so a
# profile that loaded a different copy of this extension is still found - and
# reported, because a stale copy will not have Auto-start.
function Find-ExtensionInProfile {
  param([string]$ProfileDir)

  foreach ($file in 'Secure Preferences', 'Preferences') {
    $prefs = Read-JsonFile (Join-Path $ProfileDir $file)
    if (-not $prefs -or -not $prefs.extensions -or -not $prefs.extensions.settings) { continue }

    foreach ($entry in $prefs.extensions.settings.PSObject.Properties) {
      $path = $entry.Value.path
      if (-not $path -or $path -notmatch '^[A-Za-z]:\\') { continue }

      # Skip a copy that is installed but switched off.
      $reasons = $entry.Value.disable_reasons
      if ($reasons -and "$reasons" -ne '0') { continue }

      $manifest = Read-JsonFile (Join-Path $path 'manifest.json')
      if ($manifest -and $manifest.name -eq $ExtensionName) { return $path }
    }
  }

  return $null
}

function Get-ChromeProfiles {
  param([string]$UserDataDir)

  $localState = Read-JsonFile (Join-Path $UserDataDir 'Local State')
  $info = $null
  if ($localState -and $localState.profile) { $info = $localState.profile.info_cache }

  $dirs = Get-ChildItem -LiteralPath $UserDataDir -Directory |
    Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' }

  foreach ($dir in $dirs) {
    $displayName = $dir.Name
    $email = ''
    if ($info) {
      $meta = $info.PSObject.Properties[$dir.Name]
      if ($meta) {
        if ($meta.Value.name) { $displayName = $meta.Value.name }
        if ($meta.Value.user_name) { $email = $meta.Value.user_name }
      }
    }

    [pscustomobject]@{
      Directory     = $dir.Name
      Name          = $displayName
      Email         = $email
      ExtensionPath = (Find-ExtensionInProfile -ProfileDir $dir.FullName)
    }
  }
}

function Test-SameFolder {
  param([string]$A, [string]$B)

  try {
    $left = [IO.Path]::GetFullPath($A).TrimEnd('\')
    $right = [IO.Path]::GetFullPath($B).TrimEnd('\')
    return ($left -eq $right)
  } catch {
    return $false
  }
}

function Invoke-Discover {
  $userDataDir = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
  if (-not (Test-Path -LiteralPath $userDataDir)) {
    throw "Chrome's user data folder was not found at $userDataDir"
  }

  $chrome = Find-ChromePath
  if (-not $chrome) {
    throw 'chrome.exe was not found. Set chromePath in profiles.json by hand.'
  }

  $all = @(Get-ChromeProfiles -UserDataDir $userDataDir)

  # Re-running -Discover keeps choices already made in an existing profiles.json.
  $existing = Read-JsonFile $ConfigPath
  $previous = @{}
  if ($existing -and $existing.profiles) {
    foreach ($p in $existing.profiles) { if ($p -and $p.directory) { $previous[$p.directory] = $p } }
  }

  $selected = foreach ($p in ($all | Where-Object { $_.ExtensionPath })) {
    $enabled = $true
    $urls = @()
    if ($previous.ContainsKey($p.Directory)) {
      $enabled = [bool]$previous[$p.Directory].enabled
      if ($previous[$p.Directory].urls) { $urls = @($previous[$p.Directory].urls) }
    }

    [ordered]@{
      directory     = $p.Directory
      name          = $p.Name
      enabled       = $enabled
      extensionPath = $p.ExtensionPath
      urls          = $urls
    }
  }

  $config = [ordered]@{
    chromePath                  = $chrome
    initialDelaySeconds         = 30
    staggerSeconds              = 0
    disableBackgroundThrottling = $true
    profiles                    = @($selected | Where-Object { $_ })
  }

  if ($existing) {
    foreach ($key in 'chromePath', 'initialDelaySeconds', 'staggerSeconds', 'disableBackgroundThrottling') {
      if ($null -ne $existing.$key) { $config[$key] = $existing.$key }
    }
  }

  $config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8

  Write-Host ''
  Write-Host 'Chrome profiles on this machine:' -ForegroundColor Cyan
  $all | ForEach-Object {
    $status = 'skipped - extension not installed'
    $note = ''
    if ($_.ExtensionPath) {
      $status = 'will launch'
      if (-not (Test-SameFolder $_.ExtensionPath $RepoRoot)) {
        $note = "loads a DIFFERENT copy: $($_.ExtensionPath)"
      }
    }
    [pscustomobject]@{
      Directory = $_.Directory
      Name      = $_.Name
      SignedIn  = $_.Email
      Status    = $status
      Note      = $note
    }
  } | Sort-Object Directory | Format-Table -AutoSize | Out-String -Width 240 | Write-Host

  $count = @($config.profiles).Count
  Write-Host ("Wrote {0} with {1} profile(s)." -f $ConfigPath, $count) -ForegroundColor Green

  if ($count -eq 0) {
    Write-Host 'No profile has the extension installed, so nothing would be launched.' -ForegroundColor Yellow
  }
  if ($all | Where-Object { $_.ExtensionPath -and -not (Test-SameFolder $_.ExtensionPath $RepoRoot) }) {
    Write-Host 'Some profiles load a different copy of the extension. Those copies may not have Auto-start; reload them from this folder.' -ForegroundColor Yellow
  }
}

function Invoke-Launch {
  $configExists = Test-Path -LiteralPath $ConfigPath
  $config = Read-JsonFile $ConfigPath

  # A file that exists but can't be read was probably edited by hand. Never
  # overwrite it - that would silently throw away the edits.
  if ($configExists -and -not $config) {
    throw "$ConfigPath exists but could not be read. Fix it, or delete it so the launcher can create a new one."
  }

  # First run on a machine, or a list that came back empty (for example the
  # task was installed before the extension was loaded in any profile): find the
  # profiles now instead of opening nothing. A list whose profiles are only
  # disabled is left alone - that was a deliberate choice.
  $listed = @()
  if ($config) { $listed = @($config.profiles | Where-Object { $_ }) }
  if (-not $config -or $listed.Count -eq 0) {
    if ($configExists) { $reason = 'lists no profiles' } else { $reason = 'does not exist yet' }
    Write-Log ('profiles.json {0}; looking for Chrome profiles that have the extension.' -f $reason)
    Invoke-Discover
    $config = Read-JsonFile $ConfigPath
    if (-not $config) { throw "Could not create $ConfigPath." }
    $found = @($config.profiles | Where-Object { $_ })
    $names = ($found | ForEach-Object { '{0} ({1})' -f $_.directory, $_.name }) -join ', '
    if (-not $names) { $names = 'none' }
    Write-Log ('profiles.json now lists {0} profile(s): {1}' -f $found.Count, $names)
  }

  $chrome = $config.chromePath
  if (-not $chrome -or -not (Test-Path -LiteralPath $chrome)) {
    throw "chrome.exe not found at '$chrome'. Fix chromePath in $ConfigPath."
  }

  $profiles = @($config.profiles | Where-Object { $_ -and $_.enabled })
  if ($profiles.Count -eq 0) {
    Write-Log 'No enabled profiles in the config, so there is nothing to launch.' 'WARN'
    return
  }

  $initialDelay = Get-IntSetting $config.initialDelaySeconds 30
  $stagger = Get-IntSetting $config.staggerSeconds 0
  $useFlags = ($config.disableBackgroundThrottling -ne $false)

  if ($stagger -gt 0) {
    Write-Log ('Opening {0} profile(s), {1}s apart.' -f $profiles.Count, $stagger)
  } else {
    Write-Log ('Opening {0} profile(s) at the same time.' -f $profiles.Count)
  }

  if (-not $DryRun -and $initialDelay -gt 0) {
    Write-Log ('Waiting {0}s for Windows to finish starting up.' -f $initialDelay)
    Start-Sleep -Seconds $initialDelay
  }

  # Chrome runs every profile in one browser process and only reads these flags
  # from the command line that starts that process. Later launches are handed to
  # the running process and their flags are ignored.
  $alreadyRunning = [bool](Get-Process -Name chrome -ErrorAction SilentlyContinue)
  if ($useFlags -and $alreadyRunning) {
    Write-Log 'Chrome is already running, so the background-throttling flags cannot take effect this time. They only apply when this script is what starts Chrome. If Chrome keeps running after you close it, turn off Settings > System > "Continue running background apps when Google Chrome is closed".' 'WARN'
  }

  $offset = 0
  for ($i = 0; $i -lt $profiles.Count; $i++) {
    $p = $profiles[$i]

    # With staggerSeconds = 0 every profile opens together. The one exception
    # is a cold start: the first launch gets a moment to create Chrome's main
    # process, so the rest are handed to it instead of each racing to start
    # their own.
    $wait = 0
    if ($i -gt 0) {
      if ($stagger -gt 0) {
        $wait = $stagger
      } elseif ($i -eq 1 -and -not $alreadyRunning) {
        $wait = $ColdStartSettleSeconds
      }
    }
    if ($wait -gt 0) {
      $offset += $wait
      if (-not $DryRun) { Start-Sleep -Seconds $wait }
    }

    $chromeArgs = @('--profile-directory="{0}"' -f $p.directory)
    if ($useFlags) { $chromeArgs += $ThrottlingFlags }
    foreach ($url in @($p.urls)) {
      if ($url) { $chromeArgs += ('"{0}"' -f $url) }
    }
    $argLine = $chromeArgs -join ' '

    if ($DryRun) {
      Write-Log ('[dry run] +{0}s  {1} ({2}): "{3}" {4}' -f $offset, $p.directory, $p.name, $chrome, $argLine)
    } else {
      Write-Log ('Opening {0} ({1})' -f $p.directory, $p.name)
      try {
        Start-Process -FilePath $chrome -ArgumentList $argLine | Out-Null
      } catch {
        Write-Log ('Could not open {0}: {1}' -f $p.directory, $_.Exception.Message) 'ERROR'
      }
    }
  }

  if ($DryRun) {
    Write-Log 'Dry run only. Nothing was launched.'
  } else {
    Write-Log 'All profiles opened. Each one starts its own automation if Auto-start is on in its popup.'
  }
}

function Install-LauncherTask {
  $user = '{0}\{1}' -f $env:USERDOMAIN, $env:USERNAME
  $argument = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $ScriptPath

  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
  # "At log on", not "At startup": Chrome needs your signed-in desktop session.
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
  # A laptop is often on battery; without these the task silently never runs.
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'Opens all Chrome profiles that run Email Read Automate at logon.' `
    -Force | Out-Null

  Write-Host ("Installed '{0}'. It runs at every logon for {1}." -f $TaskName, $user) -ForegroundColor Green
  Write-Host 'Remove it any time with -UninstallTask.'
}

function Uninstall-LauncherTask {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host ("Removed '{0}'." -f $TaskName) -ForegroundColor Green
  } else {
    Write-Host ("'{0}' is not installed." -f $TaskName)
  }
}

try {
  if ($InstallTask) { Install-LauncherTask; return }
  if ($UninstallTask) { Uninstall-LauncherTask; return }
  if ($Discover) { Invoke-Discover; return }
  Invoke-Launch
} catch {
  Write-Log $_.Exception.Message 'ERROR'
  exit 1
}
