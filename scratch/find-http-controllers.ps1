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
    
    # Check if inherits from ApiController
    $isApiController = $false
    $current = $t
    while ($current) {
        if ($current.FullName -eq 'System.Web.Http.ApiController') {
            $isApiController = $true
            break
        }
        $current = $current.BaseType
    }
    
    # Check if implements IHttpController
    $implementsIHttpController = $false
    try {
        $interfaces = $t.GetInterfaces()
        foreach ($i in $interfaces) {
            if ($i.FullName -eq 'System.Web.Http.Controllers.IHttpController') {
                $implementsIHttpController = $true
                break
            }
        }
    } catch {}

    if ($isApiController -or $implementsIHttpController) {
        Write-Output "FOUND CONTROLLER: $($t.FullName) (IsApiController: $isApiController, ImplementsIHttpController: $implementsIHttpController)"
        $methods = $t.GetMethods([System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::DeclaredOnly)
        foreach ($m in $methods) {
            Write-Output "  Method: $($m.Name) (Params: $(($m.GetParameters() | ForEach-Object { $_.ParameterType.Name + ' ' + $_.Name }) -join ', '))"
        }
    }
}
