# =============================================================================
#  kiem-tra-worker.ps1 - Kiem tra Worker proxy (proxy jsonbin) da dung chua
# -----------------------------------------------------------------------------
#  Chay:  powershell -ExecutionPolicy Bypass -File cloudflare-worker\kiem-tra-worker.ps1
#         (co the truyen URL khac: -WorkerUrl https://ten-worker.workers.dev)
#
#  Script kiem tra 2 thu:
#    1) Worker co tra ve du lieu duoc khong (neu 500/401 = thieu JSONBIN_MASTER_KEY)
#    2) Phan hoi /data co giu khoa 'projects' (Kho Du an) khong
#
#  Ket qua co the la:
#    OK             -> Worker da la ban moi + bin da co Kho Du an.
#    CHUA CO PROJECT-> Worker da la ban moi NHUNG bin chua co du an nao (hoac Worker
#                      con ban cu). Vao trang Du an (admin) bam "Luu lai" roi chay lai
#                      script: thay 'projects' => Worker da dung.
#    LOI 4xx/5xx    -> Doc phan BODY de biet ly do. Thuong gap nhat:
#                        {"error":"Doc jsonbin that bai: 401"}
#                      = Worker thieu/sai bien JSONBIN_MASTER_KEY (Settings -> Variables
#                        and Secrets -> them lai Secret JSONBIN_MASTER_KEY).
#  (Script chi doc /data cong khai, khong gui du lieu gi len server.)
# =============================================================================
param([string]$WorkerUrl = 'https://giangn.n-giang06022000.workers.dev')

$url = $WorkerUrl.TrimEnd('/') + '/data'
Write-Host "Dang kiem tra: $url"

$status = 0
$bodyText = ''
$tmpBody = Join-Path $env:TEMP 'worker-check-body.json'
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if ($curl) {
    # curl.exe co san tren Windows 10+ : doc duoc ca phan BODY khi server tra loi 4xx/5xx
    $code = & curl.exe -sS -o $tmpBody -w '%{http_code}' $url 2>$null
    $status = [int]$code
    if (Test-Path $tmpBody) { $bodyText = [System.IO.File]::ReadAllText($tmpBody) }
} else {
    try {
        $response = Invoke-WebRequest -Uri $url -TimeoutSec 30 -UseBasicParsing
        $status = [int]$response.StatusCode
        $bodyText = $response.Content
    } catch {
        $resp = $_.Exception.Response
        if (-not $resp) {
            Write-Host ("KHONG GOI DUOC WORKER: " + $_.Exception.Message) -ForegroundColor Red
            exit 1
        }
        $status = [int]$resp.StatusCode
        try {
            $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $bodyText = $reader.ReadToEnd()
        } catch { $bodyText = '' }
    }
}

Write-Host ("HTTP " + $status)
if ($status -ne 200) {
    Write-Host ("BODY: " + $bodyText) -ForegroundColor Red
    if ($status -ge 500 -or $status -eq 401 -or $bodyText -match 'jsonbin') {
        Write-Host '=> Worker KHONG doc/ghi duoc jsonbin. Kiem tra:' -ForegroundColor Yellow
        Write-Host '   Cloudflare Dashboard -> Worker -> Settings -> Variables and Secrets' -ForegroundColor Yellow
        Write-Host '   - JSONBIN_MASTER_KEY (Secret): Master Key cua jsonbin.io (chuoi bat dau bang: $2a$10$...)' -ForegroundColor Yellow
        Write-Host '   - JSONBIN_BIN_ID (Text, tuy chon): 6a9fd4f2ac6210605ab2e044' -ForegroundColor Yellow
        Write-Host '   Sau khi them/sua bien phai bam Deploy lai.' -ForegroundColor Yellow
    }
    exit 3
}

$parsed = $bodyText | ConvertFrom-Json
$record = if ($parsed.record) { $parsed.record } else { $parsed }
$keys = @($record.PSObject.Properties | ForEach-Object { $_.Name })

Write-Host ("Cac khoa tra ve: " + ($keys -join ', '))

if ($keys -contains 'projects') {
    $count = @($record.projects).Count
    Write-Host "OK: Worker da giu khoa 'projects' -> Kho Du an dong bo duoc len jsonbin." -ForegroundColor Green
    Write-Host "So du an dang co trong bin: $count"
    exit 0
}

Write-Host "CHUA THAY khoa 'projects' trong bin. Hai kha nang:" -ForegroundColor Yellow
Write-Host "  1) Bin chua co du an nao (moi xoa het / chua tung luu duoc) -> vao trang Du an (admin)" -ForegroundColor Yellow
Write-Host "     bam nut 'Luu lai' roi chay lai script nay. Thay 'projects' tuc moi thu da dung." -ForegroundColor Yellow
Write-Host "  2) Worker tren Cloudflare van la BAN CU (khong giu khoa projects) -> dan lai toan bo" -ForegroundColor Yellow
Write-Host "     cloudflare-worker\worker.js vao Edit code -> Deploy (editor khong duoc con gach do)." -ForegroundColor Yellow
exit 2
