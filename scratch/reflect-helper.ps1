$ErrorActionPreference = 'SilentlyContinue'
$SdkDir = 'C:\Access Computech Pvt Ltd\ACPL CAPTURE API'

# Load all assemblies in the SDK dir
Get-ChildItem -Path $SdkDir -Filter *.dll | ForEach-Object {
    try {
        [Reflection.Assembly]::LoadFrom($_.FullName) | Out-Null
    } catch {}
}

try {
    $assembly = [Reflection.Assembly]::LoadFile('C:\Access Computech Pvt Ltd\ACPL CAPTURE API\ACPL_ISOTemplate_Utility.exe')
    $types = $assembly.GetTypes()
} catch {
    $types = $_.Exception.Types
    if (-not $types) {
        $types = $_.Exception.InnerException.Types
    }
}

Write-Output "Successfully loaded types: $($types.Count)"
foreach ($t in $types) {
    if (-not $t) { continue }
    # Search for anything that implements IHttpController or ApiController or contains FM220 in the name
    if ($t.Name -like '*FM220*' -or $t.FullName -like '*FM220*' -or $t.Name -like '*Controller*') {
        Write-Output "Type: $($t.FullName)"
        $methods = $t.GetMethods([System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::DeclaredOnly)
        foreach ($m in $methods) {
            if ($m.Name.StartsWith("get_") -or $m.Name.StartsWith("set_")) { continue }
            Write-Output "  Method: $($m.Name) (Params: $(($m.GetParameters() | ForEach-Object { $_.ParameterType.Name + ' ' + $_.Name }) -join ', '))"
        }
    }
}
