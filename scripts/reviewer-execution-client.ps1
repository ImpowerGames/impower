param([string]$Operation)
$ErrorActionPreference = 'Stop'
try {
  $serviceUrl = $env:IMPOWER_REVIEW_EXECUTION_URL
  $serviceToken = $env:IMPOWER_REVIEW_EXECUTION_TOKEN
  if ($serviceUrl -notmatch '^http://127\.0\.0\.1:\d+$' -or $serviceToken -notmatch '^[a-f0-9]{64}$') { throw 'No launcher execution service was delegated to this reviewer' }
  if ($args.Count -gt 0 -or ($Operation -and $Operation -notmatch '^[a-z][a-z0-9-]{0,63}$')) { throw 'Supply at most one declared operation ID' }
  $headers = @{ Authorization = "Bearer $serviceToken" }
  if (-not $Operation) {
    $result = Invoke-RestMethod -Uri "$serviceUrl/operations" -Headers $headers -MaximumRedirection 0
  } else {
    $result = Invoke-RestMethod -Method Post -Uri "$serviceUrl/operations/$Operation" -Headers $headers -MaximumRedirection 0
    while ($result.state -eq 'running') {
      Start-Sleep -Milliseconds 500
      $result = Invoke-RestMethod -Uri "$serviceUrl/operations/$Operation" -Headers $headers -MaximumRedirection 0
    }
  }
  ConvertTo-Json -InputObject $result -Depth 10
  if ($Operation -and -not $result.passed) { exit 1 }
} catch {
  Write-Error $_.Exception.Message -ErrorAction Continue
  exit 1
}
