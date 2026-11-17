$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Install Node.js 22.12 or newer from nodejs.org, then run this script again.' }
$nodePath = $nodeCommand.Source
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
$npmCandidates = @(
  (Join-Path (Split-Path $nodePath) 'node_modules/npm/bin/npm-cli.js'),
  (Join-Path $env:USERPROFILE '.codex/tools/dermascreen-npm/package/bin/npm-cli.js')
)
function Invoke-ProjectNpm {
  param([string[]]$NpmArguments)
  if ($npmCommand) { & $npmCommand.Source @NpmArguments }
  else {
    $npmCli = $npmCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $npmCli) { throw 'npm is missing. Install the standard Node.js distribution from nodejs.org.' }
    & $nodePath $npmCli @NpmArguments
  }
  if ($LASTEXITCODE -ne 0) { throw 'A project setup command failed. See the message above.' }
}
if (-not (Test-Path -LiteralPath '.env')) {
  $randomBytes = New-Object byte[] 48
  $randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $randomGenerator.GetBytes($randomBytes)
  $randomGenerator.Dispose()
  $sessionSecret = [Convert]::ToBase64String($randomBytes)
  $envText = Get-Content -Raw -LiteralPath '.env.example'
  $envText = $envText.Replace('replace-with-a-random-secret-at-least-32-characters', $sessionSecret)
  Set-Content -LiteralPath '.env' -Value $envText
}
if (-not (Test-Path -LiteralPath 'node_modules')) { Invoke-ProjectNpm -NpmArguments @('ci') }
Invoke-ProjectNpm -NpmArguments @('run','db:generate')
if (-not (Test-Path -LiteralPath '.data/campusbite')) { Invoke-ProjectNpm -NpmArguments @('run','seed') }
Write-Host 'CampusBite will be available at http://localhost:5173. Open this address in your browser. Keep this window running. Press Ctrl+C to stop.'
Invoke-ProjectNpm -NpmArguments @('run','dev')
