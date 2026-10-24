<#
  Registers a Windows scheduled task that runs the import regularly, also when no terminal is open.
  Runs as the current user (no password needed, only while that user is logged on).
  The database container must be running, i.e. Docker Desktop has to be started.

  Usage:   powershell -ExecutionPolicy Bypass -File scripts\install-import-task.ps1 [-IntervalMinutes 60]
  Remove:  powershell -ExecutionPolicy Bypass -File scripts\install-import-task.ps1 -Remove
#>
param(
  [int]$IntervalMinutes = 60,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$taskName = 'Demo-Ticker Import'

if ($Remove) {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Aufgabe '$taskName' entfernt."
  } else {
    Write-Host "Aufgabe '$taskName' existiert nicht."
  }
  return
}

$projectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = (Get-Command node -ErrorAction Stop).Source
$logDir = Join-Path $projectDir 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null

# cmd.exe is used so that stdout and stderr can be appended to a log file with a timestamp line.
$command = "cd /d `"$projectDir`" && echo [%DATE% %TIME%] import started >> logs\import.log && `"$node`" src\jobs\import-assemblies.js >> logs\import.log 2>&1"
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c $command" -WorkingDirectory $projectDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Ruft die Versammlungsdaten der Polizei Berlin ab und archiviert sie (Demo-Ticker).' -Force | Out-Null

Write-Host "Aufgabe '$taskName' angelegt: alle $IntervalMinutes Minuten, erster Lauf in etwa einer Minute."
Write-Host "Protokoll: $logDir\import.log"
Write-Host "Sofort ausfuehren: Start-ScheduledTask -TaskName '$taskName'"
