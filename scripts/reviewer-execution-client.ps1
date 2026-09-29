param([string]$Operation, [string]$RequestFile)
$ErrorActionPreference = 'Stop'
try {
  $serviceUrl = $env:IMPOWER_REVIEW_EXECUTION_URL
  $serviceToken = $env:IMPOWER_REVIEW_EXECUTION_TOKEN
  if ($serviceUrl -notmatch '^http://127\.0\.0\.1:\d+$' -or $serviceToken -notmatch '^[a-f0-9]{64}$') { throw 'No launcher execution service was delegated to this reviewer' }
  if ($args.Count -gt 0 -or ($Operation -and $Operation -notmatch '^[a-z][a-z0-9-]{0,63}$') -or ($RequestFile -and -not $Operation)) { throw 'Supply an operation ID and optional editor request JSON file' }
  $headers = @{ Authorization = "Bearer $serviceToken" }
  if (-not $Operation) {
    $result = Invoke-RestMethod -Uri "$serviceUrl/operations" -Headers $headers -MaximumRedirection 0
  } else {
    $suffix = "/operations/$Operation"
    if ($RequestFile) {
      $requestPath = (Resolve-Path -LiteralPath $RequestFile).ProviderPath
      if ((Get-Item -LiteralPath $requestPath).Length -gt 131072) { throw 'Editor request file exceeds 128 KiB' }
      $requestText = [System.IO.File]::ReadAllText($requestPath)
      $request = $requestText | ConvertFrom-Json
      if ($request.requestId -notmatch '^[a-z][a-z0-9-]{0,63}$') { throw 'Editor requests need a requestId' }
      $suffix += "/requests/$($request.requestId)"
      $result = Invoke-RestMethod -Method Post -Uri "$serviceUrl$suffix" -Headers $headers -MaximumRedirection 0 -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($requestText))
    } else {
      $result = Invoke-RestMethod -Method Post -Uri "$serviceUrl$suffix" -Headers $headers -MaximumRedirection 0
    }
    while ($result.state -eq 'running') {
      Start-Sleep -Milliseconds 500
      $result = Invoke-RestMethod -Uri "$serviceUrl$suffix" -Headers $headers -MaximumRedirection 0
    }
  }
  if ($result.screenshots) {
    foreach ($shot in $result.screenshots) {
      if ($shot.name -notmatch '^image-[0-4]\.png$' -or $shot.base64.Length -gt 12582912) { throw 'Invalid screenshot response' }
      $imagePath = Join-Path (Get-Location).ProviderPath ("editor-" + [guid]::NewGuid().ToString() + "-" + $shot.name)
      $stream = [System.IO.File]::Open($imagePath, [System.IO.FileMode]::CreateNew)
      try { $bytes = [Convert]::FromBase64String($shot.base64); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
      $shot.PSObject.Properties.Remove('base64')
      $shot | Add-Member -NotePropertyName path -NotePropertyValue $imagePath
    }
  }
  ConvertTo-Json -InputObject $result -Depth 10
  if ($Operation -and -not $result.passed) { exit 1 }
} catch {
  Write-Error $_.Exception.Message -ErrorAction Continue
  exit 1
}
