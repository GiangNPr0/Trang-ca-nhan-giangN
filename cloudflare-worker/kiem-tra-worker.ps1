# =============================================================================
#  kiem-tra-worker.ps1 - Kiem tra Worker proxy da giu khoa "projects" chua
# -----------------------------------------------------------------------------
#  Chay:  powershell -ExecutionPolicy Bypass -File cloudflare-worker\kiem-tra-worker.ps1
#         (co the truyen URL khac: -WorkerUrl https://ten-worker.workers.dev)
#
#  Ket qua:
#    OK      -> Worker da la ban moi, Kho Du an dong bo duoc len jsonbin.
#    CANH BAO-> Worker dang chay BAN CU (thieu khoa 'projects'): moi lan ghi bin
#               (admin luu, khach gui loi nhan, tha tim) se XOA Kho Du an.
#               Sua: dash.cloudflare.com -> Workers & Pages -> Worker -> Edit code
#                    -> dan toan bo cloudflare-worker\worker.js -> Deploy.
#  (Script chi doc /data cong khai, khong gui du lieu gi len server.)
# =============================================================================
param([string]$WorkerUrl = 'https://giangn.n-giang06022000.workers.dev')

$url = $WorkerUrl.TrimEnd('/') + '/data'
Write-Host "Dang kiem tra: $url"

try {
    $response = Invoke-RestMethod -Uri $url -TimeoutSec 30 -UseBasicParsing
} catch {
    Write-Host "KHONG GOI DUOC WORKER: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$record = if ($response.record) { $response.record } else { $response }
$keys = @($record.PSObject.Properties | ForEach-Object { $_.Name })

Write-Host ("Cac khoa tra ve: " + ($keys -join ', '))

if ($keys -contains 'projects') {
    $count = @($record.projects).Count
    Write-Host "OK: Worker da giu khoa 'projects' -> Kho Du an dong bo duoc len jsonbin." -ForegroundColor Green
    Write-Host "So du an dang co trong bin: $count"
    exit 0
}

Write-Host "CANH BAO: Worker dang chay BAN CU - phan hoi /data KHONG co khoa 'projects'." -ForegroundColor Yellow
Write-Host "  => Moi lan ghi bin se XOA Kho Du an (anh/video vua them o trang du-an)." -ForegroundColor Yellow
Write-Host "  => Cach sua: Cloudflare Dashboard -> Workers & Pages -> Worker -> Edit code" -ForegroundColor Yellow
Write-Host "               -> xoa het code cu -> dan toan bo cloudflare-worker\worker.js -> Deploy." -ForegroundColor Yellow
Write-Host "  => Sau khi deploy, chay lai script nay de xac nhan, roi vao trang Du an bam 'Luu lai'." -ForegroundColor Yellow
exit 2
