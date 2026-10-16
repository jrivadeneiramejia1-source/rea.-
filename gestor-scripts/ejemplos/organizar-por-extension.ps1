<#
.SYNOPSIS
    Ordena una carpeta (por defecto, Descargas) moviendo cada archivo a una subcarpeta según su tipo.
.DESCRIPTION
    Primero muestra una vista previa y solo mueve si escribes SI. No entra a subcarpetas, no toca
    archivos ocultos ni del sistema, y si ya existe un archivo con el mismo nombre agrega (1), (2)...
#>
$ErrorActionPreference = 'Stop'

function Get-CarpetaDescargas {
    $clave = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
    $guid = '{374DE290-123F-4565-9164-39C4925E467B}'
    if (Test-Path -LiteralPath $clave) {
        $valor = (Get-ItemProperty -LiteralPath $clave -Name $guid -ErrorAction SilentlyContinue).$guid
        if ($valor) { return [Environment]::ExpandEnvironmentVariables($valor) }
    }
    return Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
}

$tipos = [ordered]@{
    'Imagenes'     = '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.svg', '.ico'
    'Documentos'   = '.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.xls', '.xlsx', '.csv', '.ppt', '.pptx'
    'Videos'       = '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm'
    'Audio'        = '.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac'
    'Comprimidos'  = '.zip', '.rar', '.7z', '.tar', '.gz', '.iso'
    'Instaladores' = '.exe', '.msi', '.msix', '.appx', '.apk'
    'Codigo'       = '.ps1', '.bat', '.cmd', '.py', '.sh', '.js', '.json', '.html', '.css', '.xml'
}
$destinoDe = @{}
foreach ($t in $tipos.Keys) { foreach ($ext in $tipos[$t]) { $destinoDe[$ext] = $t } }

function Get-RutaLibre([string]$Carpeta, [string]$Nombre) {
    $ruta = Join-Path $Carpeta $Nombre
    $base = [IO.Path]::GetFileNameWithoutExtension($Nombre)
    $ext = [IO.Path]::GetExtension($Nombre)
    $n = 1
    while (Test-Path -LiteralPath $ruta) {
        $ruta = Join-Path $Carpeta ("{0} ({1}){2}" -f $base, $n, $ext)
        $n++
    }
    return $ruta
}

try {
    $porDefecto = Get-CarpetaDescargas
    $entrada = Read-Host "Carpeta a ordenar (Enter = $porDefecto)"
    $carpeta = if ([string]::IsNullOrWhiteSpace($entrada)) { $porDefecto } else { $entrada.Trim('"', ' ') }
    if (-not (Test-Path -LiteralPath $carpeta -PathType Container)) { throw "No existe la carpeta: $carpeta" }

    $archivos = @(Get-ChildItem -LiteralPath $carpeta -File | Where-Object {
        -not ($_.Attributes -band [IO.FileAttributes]::Hidden) -and -not ($_.Attributes -band [IO.FileAttributes]::System)
    })
    if ($archivos.Count -eq 0) { Write-Host 'No hay archivos para ordenar.'; return }

    $plan = foreach ($a in $archivos) {
        $tipo = $destinoDe[$a.Extension.ToLowerInvariant()]
        if (-not $tipo) { $tipo = 'Otros' }
        [pscustomobject]@{ Archivo = $a; Tipo = $tipo }
    }
    Write-Host "`nVista previa en ${carpeta}:" -ForegroundColor Cyan
    $plan | Group-Object Tipo | Sort-Object Count -Descending | Format-Table @{ n = 'Carpeta'; e = { $_.Name } }, @{ n = 'Archivos'; e = { $_.Count } } -AutoSize | Out-Host

    if ((Read-Host 'Escribe SI para mover los archivos') -ne 'SI') { Write-Host 'Cancelado: no se movió nada.'; return }

    $movidos = 0
    $fallidos = 0
    foreach ($p in $plan) {
        try {
            $destino = Join-Path $carpeta $p.Tipo
            if (-not (Test-Path -LiteralPath $destino)) { New-Item -ItemType Directory -Path $destino | Out-Null }
            Move-Item -LiteralPath $p.Archivo.FullName -Destination (Get-RutaLibre $destino $p.Archivo.Name)
            $movidos++
        }
        catch {
            $fallidos++
            Write-Warning "No se movió $($p.Archivo.Name): $($_.Exception.Message)"
        }
    }
    Write-Host "Listo: $movidos movidos, $fallidos con error (por ejemplo, archivos abiertos)." -ForegroundColor Green
}
catch {
    Write-Error "No se pudo ordenar la carpeta: $($_.Exception.Message)"
}
