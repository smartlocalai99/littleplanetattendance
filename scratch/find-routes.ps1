$exePath = 'C:\Access Computech Pvt Ltd\ACPL CAPTURE API\ACPL_ISOTemplate_Utility.exe'
$bytes = [System.IO.File]::ReadAllBytes($exePath)

# Get ASCII strings
$asciiStrings = [System.Text.Encoding]::ASCII.GetString($bytes)
# Get Unicode strings
$unicodeStrings = [System.Text.Encoding]::Unicode.GetString($bytes)

$allStrings = $asciiStrings + "`n" + $unicodeStrings

# Regex for URL paths or methods
$matches = [regex]::Matches($allStrings, '(?i)(/FM220/[a-z0-9_-]+|match[a-z0-9_-]*|tmpl[a-z0-9_-]*)')
$results = @()
foreach ($m in $matches) {
    $results += $m.Value
}

Write-Output "--- Found Patterns ---"
$results | Select-Object -Unique | Sort-Object | Out-String | Write-Host
