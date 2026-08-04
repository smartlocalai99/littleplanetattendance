$ErrorActionPreference = 'SilentlyContinue'
[System.IO.Directory]::SetCurrentDirectory('C:\Access Computech Pvt Ltd\ACPL CAPTURE API')
try {
    $assembly = [Reflection.Assembly]::LoadFile('C:\Access Computech Pvt Ltd\ACPL CAPTURE API\ACPL_ISOTemplate_Utility.exe')
    $types = $assembly.GetTypes()
} catch {
    $types = $_.Exception.InnerException.Types
    if (-not $types) {
        $types = $_.Exception.Types
    }
}

foreach ($t in $types) {
    if (-not $t) { continue }
    $baseName = if ($t.BaseType) { $t.BaseType.FullName } else { "" }
    if ($t.Name -like '*Controller*' -or $baseName -like '*Controller*') {
        Write-Output "Type: $($t.FullName) (Base: $baseName)"
        $methods = $t.GetMethods([System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::DeclaredOnly)
        foreach ($m in $methods) {
            Write-Output "  Method: $($m.Name)"
        }
    }
}
