param(
  [string]$Source = "D:\GitHub\img2threejs"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$skillFile = Join-Path $sourcePath "SKILL.md"
if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) {
  throw "img2threejs SKILL.md was not found at $sourcePath"
}

$skillsDirectory = Join-Path $projectRoot ".agents\skills"
$linkPath = Join-Path $skillsDirectory "img2threejs"
New-Item -ItemType Directory -Path $skillsDirectory -Force | Out-Null

if (Test-Path -LiteralPath $linkPath) {
  $existing = Get-Item -LiteralPath $linkPath -Force
  if (($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $existing.Target -contains $sourcePath) {
    Write-Host "img2threejs skill is already linked."
    exit 0
  }
  throw "Refusing to replace existing path: $linkPath"
}

New-Item -ItemType Junction -Path $linkPath -Target $sourcePath | Out-Null
Write-Host "Linked $linkPath -> $sourcePath"
