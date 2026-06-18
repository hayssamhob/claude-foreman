# Launched by the "agent-manager" Windows Scheduled Task at logon.
$proj = "C:\Users\Hayssam\Claude\Projects\Github-App"
Set-Location $proj
New-Item -ItemType Directory -Force "$proj\data" | Out-Null
$log = "$proj\data\server.log"
# Keep the log from growing unbounded
if ((Test-Path $log) -and (Get-Item $log).Length -gt 10MB) {
  Move-Item -Force $log "$log.old"
}
"`n=== agent-manager starting $(Get-Date -Format o) ===" | Out-File -Append -Encoding utf8 $log
& npx tsx node_modules/probot/bin/probot.js run ./src/index.ts *>> $log
