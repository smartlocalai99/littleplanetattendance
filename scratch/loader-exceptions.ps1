$ErrorActionPreference = 'Continue'
[System.IO.Directory]::SetCurrentDirectory('C:\Access Computech Pvt Ltd\ACPL CAPTURE API')
try {
    $assembly = [Reflection.Assembly]::LoadFile('C:\Access Computech Pvt Ltd\ACPL CAPTURE API\ACPL_ISOTemplate_Utility.exe')
    $types = $assembly.GetTypes()
    Write-Output "Successfully loaded types: $($types.Length)"
} catch {
    Write-Output "Catch block triggered. Exception: $_"
    Write-Output "Loader Exceptions:"
    foreach ($le in $_.Exception.LoaderExceptions) {
        Write-Output "  - $le"
    }
}
