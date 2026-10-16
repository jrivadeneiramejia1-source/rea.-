<#
.SYNOPSIS
    Cambia la resolución de la pantalla principal o reinicia el driver de video.
.DESCRIPTION
    Opción 1: lista las resoluciones que acepta el monitor y aplica la que elijas (no necesita administrador).
    Opción 2: reinicia el adaptador de video con pnputil (necesita administrador; la pantalla parpadea unos segundos).
    Atajo manual equivalente a la opción 2: Win + Ctrl + Shift + B.
#>
$ErrorActionPreference = 'Stop'

if (-not ('Pantalla' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Pantalla {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DEVMODE {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra;
        public int dmFields; public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;
        public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
        public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight;
        public int dmDisplayFlags; public int dmDisplayFrequency; public int dmICMMethod; public int dmICMIntent;
        public int dmMediaType; public int dmDitherType; public int dmReserved1; public int dmReserved2;
        public int dmPanningWidth; public int dmPanningHeight;
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool EnumDisplaySettings(string deviceName, int modeNum, ref DEVMODE devMode);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int ChangeDisplaySettings(ref DEVMODE devMode, int flags);
}
'@
}

function New-Modo {
    $m = New-Object Pantalla+DEVMODE
    $m.dmSize = [int16][Runtime.InteropServices.Marshal]::SizeOf([type][Pantalla+DEVMODE])
    return $m
}

function Get-ModosDisponibles {
    $vistos = @{}
    $lista = New-Object System.Collections.Generic.List[object]
    $i = 0
    $m = New-Modo
    while ([Pantalla]::EnumDisplaySettings($null, $i, [ref]$m)) {
        $res = '{0}x{1}' -f $m.dmPelsWidth, $m.dmPelsHeight
        if ($m.dmBitsPerPel -ge 32 -and -not $vistos.ContainsKey($res)) {
            $vistos[$res] = $true
            $lista.Add([pscustomobject]@{ Ancho = $m.dmPelsWidth; Alto = $m.dmPelsHeight })
        }
        $i++
    }
    return $lista | Sort-Object -Property @{ Expression = { $_.Ancho * $_.Alto } } -Descending
}

function Set-Resolucion([int]$Ancho, [int]$Alto) {
    $m = New-Modo
    [void][Pantalla]::EnumDisplaySettings($null, -1, [ref]$m)   # -1 = configuración actual
    $m.dmPelsWidth = $Ancho
    $m.dmPelsHeight = $Alto
    $m.dmFields = 0x00080000 -bor 0x00100000                  # DM_PELSWIDTH | DM_PELSHEIGHT
    $prueba = [Pantalla]::ChangeDisplaySettings([ref]$m, 0x02)  # CDS_TEST: solo comprueba
    if ($prueba -ne 0) { throw "La pantalla no acepta ${Ancho}x$Alto (código $prueba)." }
    $resultado = [Pantalla]::ChangeDisplaySettings([ref]$m, 0x01)  # CDS_UPDATEREGISTRY: aplica y guarda
    switch ($resultado) {
        0 { Write-Host "Resolución cambiada a ${Ancho}x$Alto." -ForegroundColor Green }
        1 { Write-Host 'Cambio guardado: reinicia el equipo para aplicarlo.' -ForegroundColor Yellow }
        default { throw "Windows rechazó el cambio (código $resultado)." }
    }
}

function Restart-DriverVideo {
    $esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $esAdmin) {
        Write-Warning 'Para reiniciar el driver abre PowerShell como administrador.'
        return
    }
    $gpus = @(Get-PnpDevice -Class Display -PresentOnly | Where-Object Status -eq 'OK')
    if ($gpus.Count -eq 0) {
        Write-Warning 'No encontré adaptadores de video activos.'
        return
    }
    foreach ($g in $gpus) {
        Write-Host "Reiniciando $($g.FriendlyName)..." -ForegroundColor Cyan
        pnputil /restart-device "$($g.InstanceId)" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            # Windows anterior a 10 2004 no tiene /restart-device: se deshabilita y se vuelve a habilitar.
            Disable-PnpDevice -InstanceId $g.InstanceId -Confirm:$false
            Start-Sleep -Seconds 3
            Enable-PnpDevice -InstanceId $g.InstanceId -Confirm:$false
        }
    }
    Write-Host 'Driver de video reiniciado.' -ForegroundColor Green
}

try {
    $actual = New-Modo
    [void][Pantalla]::EnumDisplaySettings($null, -1, [ref]$actual)
    Write-Host ("Resolución actual: {0}x{1} a {2} Hz" -f $actual.dmPelsWidth, $actual.dmPelsHeight, $actual.dmDisplayFrequency)
    Write-Host '1) Cambiar resolución'
    Write-Host '2) Reiniciar driver de video (administrador)'
    $opcion = Read-Host 'Elige 1 o 2'
    switch ($opcion) {
        '1' {
            $modos = @(Get-ModosDisponibles | Select-Object -First 12)
            for ($n = 0; $n -lt $modos.Count; $n++) { Write-Host ("{0,2}) {1}x{2}" -f ($n + 1), $modos[$n].Ancho, $modos[$n].Alto) }
            $eleccion = Read-Host 'Número de la resolución'
            $idx = 0
            if (-not [int]::TryParse($eleccion, [ref]$idx) -or $idx -lt 1 -or $idx -gt $modos.Count) { throw 'Número inválido.' }
            Set-Resolucion -Ancho $modos[$idx - 1].Ancho -Alto $modos[$idx - 1].Alto
        }
        '2' { Restart-DriverVideo }
        default { Write-Host 'Sin cambios.' }
    }
}
catch {
    Write-Error "No se pudo completar: $($_.Exception.Message)"
}
