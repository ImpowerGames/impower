<#
.SYNOPSIS
Merges Claude desktop sessions from one account/org folder into another.

.DESCRIPTION
Claude desktop keeps its Code-tab session list in
%APPDATA%\Claude\claude-code-sessions\<accountId>\<orgId>\ as one local_<uuid>.json
per session, plus archived-sessions.idx, deleted_<id> markers and scheduled-tasks.json.
Transcripts live in ~/.claude/projects and are shared by every account, so only the
session list needs moving after switching accounts.

The merge is additive and never deletes from the target:
  - a source session the target lacks is copied;
  - a target session is replaced only when the source's lastActivityAt is greater;
  - identical or newer target sessions are left alone;
  - archived-sessions.idx becomes the sorted union of both lists, keeping only ids that
    have a local_<id>.json in the target;
  - deleted_* markers and scheduled-tasks.json are not copied.
The target folder is backed up to %TEMP% before anything changes.

Fully quit Claude desktop first (tray icon included); a running app can overwrite the
copied files. Reopen it afterwards. Run with -WhatIf first.

When a parameter is omitted the script lists the account/org folders with session counts
and last-modified times. The target defaults to the most recently modified org folder; the
source defaults to the only other folder that holds sessions. It fails, naming the
candidates, when that choice is ambiguous.

.PARAMETER SourceAccount
Account folder name to copy sessions from.
.PARAMETER SourceOrg
Org folder name to copy sessions from.
.PARAMETER TargetAccount
Account folder name to copy sessions into.
.PARAMETER TargetOrg
Org folder name to copy sessions into.
.PARAMETER SessionsRoot
Folder holding the account folders. Defaults to %APPDATA%\Claude\claude-code-sessions.

.EXAMPLE
./scripts/transplant-desktop-sessions.ps1 -WhatIf
.EXAMPLE
./scripts/transplant-desktop-sessions.ps1 -SourceAccount <id> -SourceOrg <id> -TargetAccount <id> -TargetOrg <id>
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$SourceAccount,
  [string]$SourceOrg,
  [string]$TargetAccount,
  [string]$TargetOrg,
  [string]$SessionsRoot
)

$ErrorActionPreference = 'Stop'

if (-not $SessionsRoot) {
  if (-not $env:APPDATA) { throw 'APPDATA is not set; pass -SessionsRoot.' }
  $SessionsRoot = Join-Path $env:APPDATA 'Claude\claude-code-sessions'
}
$SessionsRoot = [IO.Path]::GetFullPath($SessionsRoot)
if (-not [IO.Directory]::Exists($SessionsRoot)) { throw "Sessions folder not found: $SessionsRoot" }

function Get-SessionFolders {
  foreach ($account in [IO.Directory]::GetDirectories($SessionsRoot)) {
    foreach ($org in [IO.Directory]::GetDirectories($account)) {
      $files = [IO.Directory]::GetFiles($org, 'local_*.json')
      $newest = [IO.Directory]::GetLastWriteTime($org)
      foreach ($f in $files) {
        $t = [IO.File]::GetLastWriteTime($f)
        if ($t -gt $newest) { $newest = $t }
      }
      [pscustomobject]@{
        Account  = [IO.Path]::GetFileName($account)
        Org      = [IO.Path]::GetFileName($org)
        Path     = $org
        Sessions = $files.Count
        Modified = $newest
      }
    }
  }
}

function Get-Activity([string]$path) {
  $json = [IO.File]::ReadAllText($path) | ConvertFrom-Json
  $v = $json.lastActivityAt
  if ($null -eq $v) { return [double]0 }
  $d = 0.0
  if ([double]::TryParse([string]$v, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { return $d }
  $dt = [DateTimeOffset]::MinValue
  if ([DateTimeOffset]::TryParse([string]$v, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$dt)) {
    return [double]$dt.ToUnixTimeMilliseconds()
  }
  return [double]0
}

function Read-ArchivedIds([string]$path) {
  if (-not [IO.File]::Exists($path)) { return @() }
  $text = [IO.File]::ReadAllText($path)
  if ([string]::IsNullOrWhiteSpace($text)) { return @() }
  $parsed = $text | ConvertFrom-Json
  if ($null -eq $parsed.archived) { return @() }
  return @($parsed.archived)
}

$folders = @(Get-SessionFolders)
if ($folders.Count -eq 0) { throw "No account/org folders under $SessionsRoot" }

Write-Host "Account/org folders under ${SessionsRoot}:"
$folders | Sort-Object Modified -Descending | ForEach-Object {
  Write-Host ('  {0} / {1}  sessions={2}  modified={3:yyyy-MM-dd HH:mm}' -f $_.Account, $_.Org, $_.Sessions, $_.Modified)
}

function Find-Folder([string]$account, [string]$org, [string]$label) {
  $m = @($folders | Where-Object { $_.Account -eq $account -and $_.Org -eq $org })
  if ($m.Count -ne 1) { throw "$label folder not found: $account / $org" }
  return $m[0]
}

if ($TargetAccount -or $TargetOrg) {
  if (-not ($TargetAccount -and $TargetOrg)) { throw 'Pass both -TargetAccount and -TargetOrg, or neither.' }
  $target = Find-Folder $TargetAccount $TargetOrg 'Target'
} else {
  $target = $folders | Sort-Object Modified -Descending | Select-Object -First 1
  Write-Host ('Target (most recently modified): {0} / {1}' -f $target.Account, $target.Org)
}

if ($SourceAccount -or $SourceOrg) {
  if (-not ($SourceAccount -and $SourceOrg)) { throw 'Pass both -SourceAccount and -SourceOrg, or neither.' }
  $source = Find-Folder $SourceAccount $SourceOrg 'Source'
} else {
  $candidates = @($folders | Where-Object { $_.Path -ne $target.Path -and $_.Sessions -gt 0 })
  if ($candidates.Count -eq 0) { throw 'No other folder holds sessions; pass -SourceAccount and -SourceOrg.' }
  if ($candidates.Count -gt 1) { throw 'More than one possible source folder (listed above); pass -SourceAccount and -SourceOrg.' }
  $source = $candidates[0]
  Write-Host ('Source (only other folder with sessions): {0} / {1}' -f $source.Account, $source.Org)
}

if ($source.Path -eq $target.Path) { throw 'Source and target are the same folder.' }

$running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -ieq 'Claude' -and $_.Path -and $_.Path -notmatch '[\\/]\.(local|claude)[\\/]' -and $_.Path -notmatch 'node_modules'
  })
if ($running.Count -gt 0) {
  Write-Warning 'Claude desktop appears to be running. Fully quit it (including the tray icon) before a real run; the running app can overwrite copied files.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backup = Join-Path ([IO.Path]::GetFullPath($env:TEMP)) "claude-sessions-backup-$stamp-$($target.Account)-$($target.Org)"

$new = 0; $updated = 0; $skipped = 0
$copies = New-Object System.Collections.Generic.List[object]
foreach ($file in [IO.Directory]::GetFiles($source.Path, 'local_*.json')) {
  $name = [IO.Path]::GetFileName($file)
  $dest = Join-Path $target.Path $name
  if (-not [IO.File]::Exists($dest)) {
    $new++; $copies.Add(@($file, $dest, 'new'))
  } elseif ((Get-Activity $file) -gt (Get-Activity $dest)) {
    $updated++; $copies.Add(@($file, $dest, 'updated'))
  } else {
    $skipped++
  }
}

$doIt = $PSCmdlet.ShouldProcess($target.Path, "merge $($copies.Count) session file(s) from $($source.Path), backing up to $backup")
if ($doIt) {
  [IO.Directory]::CreateDirectory($backup) | Out-Null
  Copy-Item -LiteralPath ($target.Path + [IO.Path]::DirectorySeparatorChar + '*') -Destination $backup -Recurse -Force
  foreach ($c in $copies) { [IO.File]::Copy($c[0], $c[1], $true) }
} else {
  foreach ($c in $copies) { Write-Host ('  would copy ({0}): {1}' -f $c[2], [IO.Path]::GetFileName($c[0])) }
}

$sourceIdx = Join-Path $source.Path 'archived-sessions.idx'
$targetIdx = Join-Path $target.Path 'archived-sessions.idx'
$ids = @(@(Read-ArchivedIds $sourceIdx) + @(Read-ArchivedIds $targetIdx) | Where-Object { $_ } | Sort-Object -Unique -CaseSensitive)
$kept = @($ids | Where-Object {
    $present = [IO.File]::Exists((Join-Path $target.Path ($_ + '.json')))
    if (-not $present -and -not $doIt) {
      $present = [IO.File]::Exists((Join-Path $source.Path ($_ + '.json')))
    }
    $present
  })
if ($doIt) {
  $payload = ([ordered]@{ v = 1; archived = $kept } | ConvertTo-Json -Compress)
  [IO.File]::WriteAllText($targetIdx, $payload, (New-Object System.Text.UTF8Encoding($false)))
}

$total = [IO.Directory]::GetFiles($target.Path, 'local_*.json').Count
if (-not $doIt) { $total += $new }

Write-Host ''
Write-Host ($(if ($doIt) { 'Summary' } else { 'Summary (dry run, nothing changed)' }))
Write-Host "  new:      $new"
Write-Host "  updated:  $updated"
Write-Host "  skipped:  $skipped"
Write-Host "  archived: $($kept.Count)"
Write-Host "  total:    $total"
Write-Host ('  backup:   {0}{1}' -f $backup, $(if ($doIt) { '' } else { ' (would be created)' }))
if ($doIt) { Write-Host 'Done. Reopen Claude desktop to see the merged sessions.' }
