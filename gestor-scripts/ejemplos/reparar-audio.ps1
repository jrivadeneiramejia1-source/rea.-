#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Repara el sonido de Windows reiniciando los servicios Audiosrv y AudioEndpointBuilder.
.DESCRIPTION
    Úsalo cuando aparece "No hay dispositivos de salida de audio" o el ícono de volumen tiene una X roja.
    Revisa que los servicios no estén deshabilitados, los reinicia en orden y muestra su estado final.
#>
$ErrorActionPreference = 'Stop'

# #Requires no siempre se aplica con "irm | iex": por eso también se verifica aquí.
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
    Write-Warning 'Abre PowerShell como administrador y vuelve a ejecutar el comando.'
    return
}

$servicios = 'AudioEndpointBuilder', 'Audiosrv'
try {
    foreach ($nombre in $servicios) {
        $svc = Get-Service -Name $nombre
        if ($svc.StartType -eq 'Disabled') {
            Set-Service -Name $nombre -StartupType Automatic
            Write-Host "El inicio de $nombre estaba deshabilitado: ahora es Automático." -ForegroundColor Yellow
        }
    }
    # Audiosrv depende de AudioEndpointBuilder: -Force detiene ambos y luego se inician en orden.
    Restart-Service -Name AudioEndpointBuilder -Force
    Start-Service -Name Audiosrv
    Start-Sleep -Seconds 2
    Get-Service -Name $servicios | Format-Table Name, Status, StartType -AutoSize | Out-Host
    Write-Host 'Listo. Si sigue sin sonido, revisa el dispositivo predeterminado en Configuración > Sistema > Sonido.' -ForegroundColor Green
}
catch {
    Write-Error "No se pudo reparar el audio: $($_.Exception.Message)"
}
