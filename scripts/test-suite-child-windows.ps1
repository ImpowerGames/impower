param([string]$Configuration)
$ErrorActionPreference='Stop'
$request = Get-Content -Raw -LiteralPath $Configuration | ConvertFrom-Json
$assembly = Join-Path (Split-Path -Parent $Configuration) 'test-suite-child-windows.exe'
Add-Type -Path (Join-Path $PSScriptRoot 'test-suite-child-windows.cs') -ReferencedAssemblies 'System.Web.Extensions.dll' -OutputAssembly $assembly -OutputType ConsoleApplication
exit 0
