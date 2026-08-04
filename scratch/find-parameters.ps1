$exePath = 'C:\Access Computech Pvt Ltd\ACPL CAPTURE API\ACPL_ISOTemplate_Utility.exe'
$bytes = [System.IO.File]::ReadAllBytes($exePath)
$ascii = [System.Text.Encoding]::ASCII.GetString($bytes)
$unicode = [System.Text.Encoding]::Unicode.GetString($bytes)
$all = $ascii + "`n" + $unicode

$matches = [regex]::Matches($all, '(?i)(tmpl[12]|temp[12]|template[12]|threshold|score|success)')
$matches | Select-Object -Unique -ExpandProperty Value | Sort-Object | Out-String | Write-Host
