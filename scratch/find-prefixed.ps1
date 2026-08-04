$exePath = 'C:\Access Computech Pvt Ltd\ACPL CAPTURE API\ACPL_ISOTemplate_Utility.exe'
$bytes = [System.IO.File]::ReadAllBytes($exePath)
$ascii = [System.Text.Encoding]::ASCII.GetString($bytes)
$unicode = [System.Text.Encoding]::Unicode.GetString($bytes)
$all = $ascii + "`n" + $unicode

$matches = [regex]::Matches($all, '(?i)\b(tmpl\w*|temp\w*|param\w*)\b')
$matches | Select-Object -Unique -ExpandProperty Value | Sort-Object | Out-String | Write-Host
