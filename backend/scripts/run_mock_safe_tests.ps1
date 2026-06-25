param(
  [string]$Pattern = "test_*.py"
)

$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$originalEnvironment = @{
  TMP = [Environment]::GetEnvironmentVariable("TMP", "Process")
  TEMP = [Environment]::GetEnvironmentVariable("TEMP", "Process")
  TMPDIR = [Environment]::GetEnvironmentVariable("TMPDIR", "Process")
  NODE_CANVAS_RUN_R2_SMOKE = [Environment]::GetEnvironmentVariable(
    "NODE_CANVAS_RUN_R2_SMOKE",
    "Process"
  )
}

$localAppData = [Environment]::GetEnvironmentVariable("LOCALAPPDATA", "Process")
if (-not [string]::IsNullOrWhiteSpace($localAppData)) {
  $systemTemp = Join-Path $localAppData "Temp"
}
else {
  $systemTemp = [Environment]::GetEnvironmentVariable("TEMP", "Machine")
  if ([string]::IsNullOrWhiteSpace($systemTemp)) {
    $systemTemp = [System.IO.Path]::GetTempPath()
  }
}

$systemTemp = [System.IO.Path]::GetFullPath($systemTemp)
$runRoot = Join-Path $systemTemp ("node-canvas-tests-" + [guid]::NewGuid().ToString("N"))
$testExitCode = 1
$cleanupFailed = $false
$locationPushed = $false

try {
  New-Item -ItemType Directory -Path $runRoot -Force | Out-Null

  $env:TMP = $runRoot
  $env:TEMP = $runRoot
  $env:TMPDIR = $runRoot
  $env:NODE_CANVAS_RUN_R2_SMOKE = "0"

  $probePath = Join-Path $runRoot "delete-probe.tmp"
  "node-canvas-test-temp-probe" | Set-Content -LiteralPath $probePath -Encoding UTF8
  Remove-Item -LiteralPath $probePath -Force -ErrorAction Stop

  $probeDirectory = Join-Path $runRoot "delete-probe-directory"
  New-Item -ItemType Directory -Path $probeDirectory -Force | Out-Null
  Remove-Item -LiteralPath $probeDirectory -Force -ErrorAction Stop

  Write-Host "Mock-safe test temp root: $runRoot"
  Push-Location $backendRoot
  $locationPushed = $true

  & python -u -m unittest discover -s tests -p $Pattern -v
  $testExitCode = $LASTEXITCODE
}
catch {
  Write-Error "Mock-safe test runner failed: $($_.Exception.Message)"
  $testExitCode = 1
}
finally {
  if ($locationPushed) {
    Pop-Location
  }

  foreach ($name in $originalEnvironment.Keys) {
    $value = $originalEnvironment[$name]
    if ($null -eq $value) {
      Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    }
    else {
      Set-Item -LiteralPath "Env:$name" -Value $value
    }
  }

  if (Test-Path -LiteralPath $runRoot) {
    $runRootParent = Split-Path -Parent $runRoot
    $runRootName = Split-Path -Leaf $runRoot
    if (
      $runRootParent -ne $systemTemp -or
      $runRootName -notmatch '^node-canvas-tests-[a-f0-9]{32}$'
    ) {
      Write-Error "Refusing to clean an unexpected test temp path: $runRoot"
      $cleanupFailed = $true
    }
    else {
      try {
        Remove-Item -LiteralPath $runRoot -Recurse -Force -ErrorAction Stop
      }
      catch {
        Write-Error "System TEMP cleanup failed for ${runRoot}: $($_.Exception.Message)"
        $cleanupFailed = $true
      }
    }
  }
}

if ($cleanupFailed) {
  exit 1
}

exit $testExitCode
