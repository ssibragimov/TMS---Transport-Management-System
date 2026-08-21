<#
.SYNOPSIS
  Собирает подложку карты аэродрома из открытых данных OpenStreetMap.

.DESCRIPTION
  Вырезает район аэропорта из планетарной сборки Protomaps в один файл
  .pmtiles рядом с веб-приложением. Файл в репозиторий не кладётся: он
  весит десяток мегабайт и восстанавливается этой командой за полминуты.

  Ни ключей, ни учётных записей, ни платежей: данные OpenStreetMap
  распространяются под лицензией ODbL, подпись об источнике выводится
  на самой карте.

  Скачивается только нужный кусок — планетарный файл читается диапазонными
  запросами, целиком его качать не нужно (он больше сотни гигабайт).

.PARAMETER Bbox
  Границы вырезаемого района: minLon,minLat,maxLon,maxLat.
  По умолчанию — окрестности ташкентского аэропорта.

.PARAMETER Output
  Куда положить файл. По умолчанию apps/web/public/map/tashkent.pmtiles.

.EXAMPLE
  ./scripts/map-tiles.ps1
  ./scripts/map-tiles.ps1 -Bbox '66.90,39.63,67.06,39.77' -Output apps/web/public/map/samarkand.pmtiles
#>
param(
  [string]$Bbox = '69.18,41.19,69.38,41.33',
  [string]$Output = 'apps/web/public/map/tashkent.pmtiles',
  [int]$MaxZoom = 15
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cli = Join-Path $root '.tools/pmtiles/pmtiles.exe'

if (-not (Test-Path $cli)) {
  Write-Host 'Инструмент pmtiles не найден. Скачиваю...' -ForegroundColor Yellow

  $version = '1.28.1'
  $url = "https://github.com/protomaps/go-pmtiles/releases/download/v$version/go-pmtiles_${version}_Windows_x86_64.zip"
  $zip = Join-Path $env:TEMP 'go-pmtiles.zip'

  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath (Split-Path $cli) -Force
  Remove-Item $zip -Force
}

# Сборки хранятся неделю, поэтому берём самую свежую из доступных,
# а не фиксированную дату: зашитая дата протухла бы через семь дней.
$source = $null
for ($i = 0; $i -le 9; $i++) {
  $date = (Get-Date).AddDays(-$i).ToString('yyyyMMdd')
  $candidate = "https://build.protomaps.com/$date.pmtiles"
  try {
    Invoke-WebRequest -Uri $candidate -Method Head -UseBasicParsing -TimeoutSec 30 | Out-Null
    $source = $candidate
    Write-Host "Источник: сборка от $date" -ForegroundColor Cyan
    break
  } catch {
    continue
  }
}

if (-not $source) {
  throw 'Не удалось найти доступную сборку Protomaps. Проверьте доступ в интернет.'
}

$target = Join-Path $root $Output
New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null

& $cli extract $source $target --bbox=$Bbox --maxzoom=$MaxZoom
if ($LASTEXITCODE -ne 0) { throw "pmtiles extract завершился с кодом $LASTEXITCODE" }

$size = (Get-Item $target).Length / 1MB
Write-Host ("Готово: {0} ({1:N1} МБ)" -f $Output, $size) -ForegroundColor Green
