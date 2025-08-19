<#
 generate-thumbs.ps1 (clean version)
 Creates thumbnails for images under assets/images -> assets/thumbs (keeps subfolders)
 Requires ImageMagick 'magick' available (PATH or tools/ImageMagick/magick.exe)
#>
param(
  [int]$MaxWidth = 600,
  [int]$Quality = 75,
  [switch]$SkipExisting,
  [switch]$Force,
  [switch]$WebP,
  [switch]$DryRun,
  [switch]$Debug,
  [string]$MagickPath
)
$ErrorActionPreference = 'Stop'

$scriptRoot = $PSScriptRoot; if(-not $scriptRoot){ $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
$root   = Split-Path $scriptRoot -Parent
$srcRoot = Join-Path $root 'assets/images'
$dstRoot = Join-Path $root 'assets/thumbs'
if(!(Test-Path $srcRoot)){ throw "Source folder not found: $srcRoot" }
if(!(Test-Path $dstRoot)){ New-Item -ItemType Directory -Path $dstRoot | Out-Null }

$patterns = @('png','jpg','jpeg','webp')
$files = Get-ChildItem $srcRoot -Recurse -File | Where-Object { $patterns -contains ($_.Extension.TrimStart('.').ToLower()) }
if(-not $files){ Write-Host 'No source images.' -ForegroundColor Yellow; return }

# Detect magick
if($MagickPath){ $magickCmd = $MagickPath } else { $magickCmd = 'magick' }
try { & $magickCmd -version 2>$null } catch {
  $localMagick = Join-Path $root 'tools/ImageMagick/magick.exe'
  if(Test-Path $localMagick){ $magickCmd = $localMagick } else { throw 'ImageMagick (magick) not found.' }
}
Write-Host "Using ImageMagick: $magickCmd" -ForegroundColor Cyan

$processed = 0; $failed=0
foreach($f in $files){
  $rel = $f.FullName.Substring($srcRoot.Length+1).Replace('\\','/')
  $dot = $rel.LastIndexOf('.')
  if($dot -gt 0){ $base = $rel.Substring(0,$dot) } else { $base = $rel }
  $initialOut = Join-Path $dstRoot ($base + '.jpg')
  $outDir = Split-Path $initialOut -Parent
  if(!(Test-Path $outDir)){ New-Item -ItemType Directory -Path $outDir | Out-Null }
  if($SkipExisting -and -not $Force -and (Test-Path $initialOut)){ continue }
  if($DryRun){ Write-Host "[DryRun] $rel"; continue }
  # Detect alpha
  $alpha=$false
  try { $ch = & $magickCmd identify -quiet -format '%[channels]' "$($f.FullName)" 2>$null; if($ch -match 'a'){ $alpha=$true } } catch {}
  if($alpha){ $outPath = [System.IO.Path]::ChangeExtension($initialOut, '.png') } else { $outPath = $initialOut }
  if($SkipExisting -and -not $Force -and (Test-Path $outPath)){ continue }
  $resizeArg = "${MaxWidth}>"
  try {
    if($alpha){
      & $magickCmd "$($f.FullName)" -auto-orient -resize $resizeArg -strip "$outPath"
    } else {
      & $magickCmd "$($f.FullName)" -auto-orient -resize $resizeArg -quality $Quality -strip "$outPath"
    }
    if($WebP){
      $webpPath = [System.IO.Path]::ChangeExtension($outPath, '.webp')
      if(-not (Test-Path $webpPath) -or $Force){ & $magickCmd "$($f.FullName)" -auto-orient -resize $resizeArg -quality ($Quality+5) -strip "$webpPath" }
    }
    $processed++
  } catch {
    $failed++
    Write-Host "FAIL: $rel -> $_" -ForegroundColor Red
  }
}
Write-Host "Generated/updated $processed thumbnails. Failed: $failed" -ForegroundColor Green
if(-not $DryRun){ try { $total = (Get-ChildItem $dstRoot -Recurse -File | Measure-Object Length -Sum).Sum; Write-Host ("Total size: {0} MB" -f ([Math]::Round($total/1MB,2))) -ForegroundColor Cyan } catch {} }
