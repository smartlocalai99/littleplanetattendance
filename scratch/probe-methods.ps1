# Disable SSL verification and enforce TLS 1.2
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$urls = @(
    "https://localhost:4443/FM220/gettmpl",
    "https://localhost:4443/FM220/MatchResult",
    "https://localhost:4443/FM220/GetMatchResult",
    "https://localhost:4443/FM220/MatchEx",
    "https://localhost:4443/FM220/MatchTmpl",
    "https://localhost:4443/FM220/match"
)

foreach ($url in $urls) {
    try {
        Write-Output "Probing GET $url..."
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 3
        Write-Output "SUCCESS GET: Status $($response.StatusCode) Content preview:"
        Write-Output ($response.Content.Substring(0, [Math]::Min($response.Content.Length, 150)))
    } catch {
        Write-Output "FAILED GET: $_"
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            Write-Output "Response body: $($reader.ReadToEnd())"
        }
    }
    Write-Output "------------------------"
}
