# Daftarkan sync otomatis: saat login Windows + tiap 15 menit.
# Jalankan dari folder ini:  powershell -ExecutionPolicy Bypass -File install_task.ps1
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pyw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $pyw) { $pyw = Join-Path (Split-Path (Get-Command python.exe).Source) "pythonw.exe" }

$action   = New-ScheduledTaskAction -Execute $pyw -Argument "`"$dir\sync_agent.py`"" -WorkingDirectory $dir
$logon    = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$logon.Delay = "PT1M"
$repeat   = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask -TaskName "JurnalTrading Sync" -Action $action -Trigger @($logon, $repeat) `
  -Settings $settings -Description "Sync riwayat MT5 ke Jurnal Trading" -Force | Out-Null
Write-Host "Terdaftar. Sync jalan 1 menit setelah login dan tiap 15 menit."
Write-Host "Log: $env:LOCALAPPDATA\JurnalTrading\sync.log"
