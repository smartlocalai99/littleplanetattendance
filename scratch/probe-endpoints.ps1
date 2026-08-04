# Disable SSL certificate verification for localhost
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

$urls = @(
    "https://localhost:4443/FM220/MatchTmpl",
    "https://localhost:4443/FM220/MatchEx",
    "https://localhost:4443/FM220/GetMatchResult",
    "https://localhost:4443/FM220/match"
)

foreach ($url in $urls) {
    try {
        Write-Output "Probing GET $url..."
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 3
        Write-Output "SUCCESS GET: Status $($response.StatusCode)"
    } catch {
        Write-Output "FAILED GET: $_"
    }

    try {
        Write-Output "Probing POST $url..."
        $response = Invoke-WebRequest -Uri $url -Method POST -Body "test" -TimeoutSec 3
        Write-Output "SUCCESS POST: Status $($response.StatusCode)"
    } catch {
        Write-Output "FAILED POST: $_"
    }
    Write-Output "------------------------"
}
