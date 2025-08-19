<#
 watch-thumbs.ps1
 Tự động:
  - Theo dõi thay đổi trong assets/images
  - Sinh thumbnail mới (gọi generate-thumbs.ps1 với -SkipExisting)
  - Báo cáo ảnh nào chưa có thumb hoặc thumb lỗi (0 byte)
  - Tuỳ chọn chạy kèm generateData khi có ảnh mới (-UpdateData)

 Chạy:
  powershell -ExecutionPolicy Bypass -File scripts/watch-thumbs.ps1 -WebP -UpdateData

 Thoát: Ctrl + C
#>
param(
  [switch]$Force,
  [switch]$WebP,
  [switch]$UpdateData,
  [int]$DebounceMs = 800,
  [int]$IntervalReportSec = 30
)
$ErrorActionPreference='Stop'
$root = (Get-Location).Path
$scriptDir = Join-Path $root 'scripts'
$imagesDir = Join-Path $root 'assets/images'
$thumbsDir = Join-Path $root 'assets/thumbs'
$genThumbScript = Join-Path $scriptDir 'generate-thumbs.ps1'
$genDataScript = Join-Path $scriptDir 'generateData.ps1'
if(!(Test-Path $imagesDir)){ throw "Không thấy thư mục ảnh: $imagesDir" }
if(!(Test-Path $genThumbScript)){ throw "Thiếu generate-thumbs.ps1" }
Write-Host "[watch-thumbs] Bắt đầu theo dõi $imagesDir" -ForegroundColor Cyan
if(!(Test-Path $thumbsDir)){ New-Item -ItemType Directory -Path $thumbsDir | Out-Null }

$script:pending=$false; $lastRun=[DateTime]::MinValue
function RunThumbJob(){
  if($script:pending){ return }
  $script:pending=$true
  $jobRoot = Get-Location
  Start-Job -ScriptBlock {
    param($genThumbScript,$Force,$WebP,$jobRoot)
    Set-Location $jobRoot
    $argsList = @('-File', $genThumbScript, '-SkipExisting')
    if($Force){ $argsList += '-Force' }
    if($WebP){ $argsList += '-WebP' }
    try {
      powershell -ExecutionPolicy Bypass @argsList | Out-String
    } catch {
      "[watch-thumbs] Lỗi chạy generate-thumbs: $_"
    }
  } -ArgumentList $genThumbScript,$Force,$WebP,$jobRoot | Out-Null
}

function SyncData(){
  if(-not $UpdateData){ return }
  try {
    powershell -ExecutionPolicy Bypass -File $genDataScript -Descending -KeepOldIds | Out-Null
    Write-Host "[watch-thumbs] Cập nhật data.js" -ForegroundColor DarkGreen
  } catch { Write-Warning "Gen data lỗi: $_" }
}

function ReportMissing(){
  $src = Get-ChildItem $imagesDir -Recurse -File -Include *.png,*.jpg,*.jpeg,*.webp
  $missing = @()
  foreach($f in $src){
    $rel = $f.FullName.Substring($imagesDir.Length+1).Replace('\\','/')
    $baseNoExt = $rel.Substring(0,$rel.LastIndexOf('.'))
    $isPng = $f.Extension -match '(?i)png'
    $thumbJ = Join-Path $thumbsDir ($baseNoExt + '.jpg')
    $thumbP = Join-Path $thumbsDir ($baseNoExt + '.png')
    $ok = $false
    if($isPng){ if(Test-Path $thumbP){ $ok=$true } elseif(Test-Path $thumbJ){ $ok=$true } }
    else { if(Test-Path $thumbJ){ $ok=$true } }
    if(-not $ok){ $missing += $rel }
  }
  if($missing.Count){
    Write-Host ("[watch-thumbs] Thiếu thumb: {0}" -f ($missing -join ', ')) -ForegroundColor Yellow
  } else {
    Write-Host "[watch-thumbs] Tất cả ảnh đã có thumbnail." -ForegroundColor DarkCyan
  }
}

$fsw = New-Object System.IO.FileSystemWatcher $imagesDir, '*.*'
$fsw.IncludeSubdirectories = $true
$fsw.EnableRaisingEvents = $true
$global:changed=$false
$action = { $global:changed = $true }
Register-ObjectEvent $fsw Created -Action $action | Out-Null
Register-ObjectEvent $fsw Changed -Action $action | Out-Null
Register-ObjectEvent $fsw Deleted -Action $action | Out-Null
Register-ObjectEvent $fsw Renamed -Action $action | Out-Null

ReportMissing
RunThumbJob
SyncData
Write-Host "[watch-thumbs] Đang xem... (Ctrl+C để dừng)" -ForegroundColor Cyan

while($true){
  Start-Sleep -Milliseconds $DebounceMs
  Get-Job | Where-Object { $_.State -in @('Completed','Failed','Stopped') } | ForEach-Object {
    $out = Receive-Job $_ -ErrorAction SilentlyContinue
    if($out){ Write-Host $out }
    Remove-Job $_ -Force
    $script:pending=$false
    SyncData
    ReportMissing
  }
  # Báo cáo định kỳ nếu không có thay đổi
  if (((Get-Date) - $lastRun).TotalSeconds -ge $IntervalReportSec) {
    $lastRun = Get-Date
  ReportMissing
  }
  if($global:changed){
    $global:changed=$false
  RunThumbJob
  }
}
