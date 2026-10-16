#Requires -Version 7.0
<#
.SYNOPSIS
    Publica Lanzador · Equipos en tu propio Firebase (gratis) y el servidor de avisos en Cloudflare (gratis).
.DESCRIPTION
    Paso a paso y con confirmación antes de publicar:
      1. Revisa Node.js y descarga las dependencias del proyecto (npm ci).
      2. Inicia sesión en Firebase y elige o crea el proyecto.
      3. Crea la base de datos Firestore si falta y te abre las páginas de la consola que no se pueden automatizar
         (activar Google y correo/contraseña, clave Web Push, clave de la cuenta de servicio).
      4. Publica el Worker de avisos en Cloudflare con la cuenta de servicio como secreto.
      5. Escribe public/config.json (con copia de respaldo si ya existía) y publica la app en Firebase Hosting.
    No instala programas en tu PC: si falta Node.js, te dice el comando para instalarlo.
.PARAMETER ProyectoId
    ID del proyecto de Firebase (ej. lanzador-jeiler). Si no lo das, te lo pregunta.
.PARAMETER SinAvisos
    Publica solo la app (sin Worker ni notificaciones push). Podrás agregarlas después.
.PARAMETER Simular
    Muestra lo que haría sin ejecutar nada.
.EXAMPLE
    pwsh -File .\instalar.ps1 -ProyectoId lanzador-jeiler
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
    [string]$ProyectoId,
    [switch]$SinAvisos,
    [switch]$Simular
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$global:LASTEXITCODE = 0
$raiz = $PSScriptRoot

function Paso([string]$texto) { Write-Host "`n▶ $texto" -ForegroundColor Cyan }
function Ok([string]$texto) { Write-Host "  ✓ $texto" -ForegroundColor Green }
function Aviso([string]$texto) { Write-Host "  ! $texto" -ForegroundColor Yellow }
function Confirmar([string]$pregunta) {
    if ($Simular) { Write-Host "  (simulación) $pregunta → sí" -ForegroundColor DarkGray; return $true }
    do { $r = (Read-Host "  $pregunta (s/n)").Trim().ToLower() } until ($r -in 's', 'n', 'si', 'sí', 'no')
    return $r -in 's', 'si', 'sí'
}
# Los comandos se llaman directo (sin capturar su salida) para que los inicios de sesión puedan preguntar en pantalla.
function Correr([string]$que) {
    if ($Simular) { Write-Host "  (simulación) $que" -ForegroundColor DarkGray; return $false }
    $global:LASTEXITCODE = 0
    return $true
}
function Revisar([string]$que) { if ($LASTEXITCODE -ne 0) { throw "Falló: $que (código $LASTEXITCODE)" } }
function Abrir([string]$url, [string]$instrucciones) {
    Write-Host "  → $instrucciones" -ForegroundColor White
    Write-Host "    $url" -ForegroundColor DarkGray
    if (-not $Simular) { Start-Process $url; [void](Read-Host '    Presiona Enter cuando termines') }
}

try {
    Push-Location $raiz

    # ---------- 1. Requisitos ----------
    Paso 'Revisando requisitos'
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Aviso 'Falta Node.js (lo usan las herramientas de Firebase y Cloudflare). Instálalo y vuelve a ejecutar:'
        Write-Host '    winget install OpenJS.NodeJS.LTS' -ForegroundColor White
        return
    }
    $version = [version]((node --version).TrimStart('v'))
    if ($version.Major -lt 20) { Aviso "Tu Node.js es $version; se necesita 20 o más nuevo: winget upgrade OpenJS.NodeJS.LTS"; return }
    Ok "Node.js $version"
    if (-not (Test-Path (Join-Path $raiz 'node_modules'))) {
        if (Correr 'npm ci (descarga dependencias, ~1 min)') { npm ci --no-audit --no-fund; Revisar 'npm ci' }
    }
    Ok 'Dependencias listas'

    # ---------- 2. Firebase ----------
    Paso 'Firebase'
    if (Correr 'firebase login') { npx firebase login; Revisar 'firebase login' }
    if (-not $ProyectoId) {
        if (Correr 'firebase projects:list') { npx firebase projects:list; Revisar 'firebase projects:list' }
        $ProyectoId = (Read-Host '  Escribe el ID del proyecto (o uno nuevo para crearlo, ej. lanzador-tunombre)').Trim().ToLower()
        if ($ProyectoId -notmatch '^[a-z][a-z0-9-]{4,28}[a-z0-9]$') { throw 'ID inválido: 6 a 30 letras minúsculas, números o guiones.' }
    }
    $existe = $false
    if (-not $Simular) {
        $lista = npx firebase projects:list --json | ConvertFrom-Json
        $existe = @($lista.result | Where-Object projectId -eq $ProyectoId).Count -gt 0
    }
    if (-not $existe) {
        if (-not (Confirmar "El proyecto '$ProyectoId' no existe. ¿Crearlo en tu cuenta de Google (plan gratis Spark)?")) { return }
        if (Correr "firebase projects:create $ProyectoId") { npx firebase projects:create $ProyectoId --display-name 'Lanzador Equipos'; Revisar 'crear proyecto' }
    }
    Ok "Proyecto: $ProyectoId"

    $rc = Join-Path $raiz '.firebaserc'
    if (-not $Simular) { @{ projects = @{ default = $ProyectoId } } | ConvertTo-Json | Set-Content -Path $rc -Encoding utf8 }

    # App web (da la configuración que Firebase Hosting entrega en /__/firebase/init.json).
    if (-not $Simular) {
        $apps = npx firebase apps:list WEB --project $ProyectoId --json | ConvertFrom-Json
        if (-not @($apps.result).Count) { npx firebase apps:create WEB 'Lanzador Equipos' --project $ProyectoId; Revisar 'crear app web' }
    }
    Ok 'App web registrada'

    # Firestore (base de datos en Estados Unidos multirregión: la de menor latencia típica desde Colombia en el plan gratis).
    $bases = if ($Simular) { '' } else { (npx firebase firestore:databases:list --project $ProyectoId 2>$null) -join "`n" }
    if ($bases -notmatch '\(default\)') {
        if (Correr 'Crear Firestore (default) en nam5') { npx firebase firestore:databases:create '(default)' --location nam5 --project $ProyectoId; Revisar 'crear Firestore' }
    }
    Ok 'Firestore listo'

    Paso 'Pasos que se hacen en la consola de Firebase (no tienen comando)'
    Abrir "https://console.firebase.google.com/project/$ProyectoId/authentication/providers" 'Authentication → Sign-in method (Método de acceso): activa «Google» y «Correo electrónico/contraseña» (Email/Password).'

    # ---------- 3. Avisos push ----------
    $config = [ordered]@{}
    if (-not $SinAvisos) {
        Paso 'Notificaciones push'
        Abrir "https://console.firebase.google.com/project/$ProyectoId/settings/cloudmessaging" 'Cloud Messaging → Configuración web → Certificados Web Push (Web Push certificates): «Generar par de claves» (Generate key pair) y copia la clave.'
        $config.vapidKey = if ($Simular) { 'CLAVE-SIMULADA' } else { (Read-Host '  Pega la clave Web Push').Trim() }
        if ($config.vapidKey -notmatch '^[A-Za-z0-9_-]{80,100}$') { Aviso 'La clave no tiene el formato esperado (unas 87 letras y números). Revísala.' }

        Abrir "https://console.firebase.google.com/project/$ProyectoId/settings/serviceaccounts/adminsdk" 'Cuentas de servicio (Service accounts) → «Generar nueva clave privada» (Generate new private key). Guárdala FUERA de esta carpeta.'
        $cuenta = if ($Simular) { 'C:\simulado\cuenta.json' } else { (Read-Host '  Ruta del archivo .json descargado (puedes arrastrarlo aquí)').Trim('"', "'", ' ') }
        if (-not $Simular) {
            if (-not (Test-Path -LiteralPath $cuenta)) { throw "No encuentro $cuenta" }
            $sa = Get-Content -LiteralPath $cuenta -Raw | ConvertFrom-Json
            if ($sa.project_id -ne $ProyectoId) { throw "Esa clave es del proyecto '$($sa.project_id)', no de '$ProyectoId'." }
            if ((Resolve-Path -LiteralPath $cuenta).Path.StartsWith($raiz, [StringComparison]::OrdinalIgnoreCase)) { Aviso 'La clave está dentro de la carpeta del proyecto: muévela afuera para no subirla a GitHub por error.' }
        }

        Paso 'Cloudflare Worker (servidor de avisos)'
        $app = "https://$ProyectoId.web.app"
        $origenes = "$app,https://$ProyectoId.firebaseapp.com"
        if (-not (Confirmar "¿Publicar el Worker 'lanzador-notificaciones' en tu cuenta de Cloudflare (gratis)?")) { return }
        Push-Location (Join-Path $raiz 'worker')
        try {
            if (Correr 'wrangler login') { npx wrangler login; Revisar 'wrangler login' }
            # La primera vez Cloudflare pide elegir un subdominio *.workers.dev: escríbelo cuando lo pregunte.
            if (Correr 'wrangler deploy') { npx wrangler deploy --var "FIREBASE_PROJECT_ID:$ProyectoId" --var "APP_URL:$app" --var "ALLOWED_ORIGINS:$origenes"; Revisar 'wrangler deploy' }
            if (-not $Simular) {
                Get-Content -LiteralPath $cuenta -Raw | npx wrangler secret put GOOGLE_SERVICE_ACCOUNT
                if ($LASTEXITCODE) { throw 'No se pudo guardar el secreto en Cloudflare.' }
            }
        }
        finally { Pop-Location }
        $url = if ($Simular) { 'https://lanzador-notificaciones.simulado.workers.dev' } else { (Read-Host '  Pega la dirección del Worker que mostró arriba (https://lanzador-notificaciones.….workers.dev)').Trim().TrimEnd('/') }
        if ($url -notmatch '^https://[\w-]+\.[\w-]+\.workers\.dev$') { throw "Esa dirección no parece de un Worker: $url" }
        $config.notifyUrl = $url
        Ok "Worker: $url"
        Aviso "Ya puedes borrar la clave descargada ($cuenta): Cloudflare guardó una copia cifrada."
    }

    # ---------- 4. Configuración y publicación ----------
    Paso 'Publicar la app'
    $cfgPath = Join-Path $raiz 'public\config.json'
    if ($config.Count) {
        if (Test-Path $cfgPath) {
            $copia = "$cfgPath.$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
            if (-not $Simular) { Copy-Item $cfgPath $copia }
            Ok "Copia de respaldo: $copia"
            # Se conservan las claves que ya tenía y se actualizan solo las nuevas.
            $viejo = Get-Content $cfgPath -Raw | ConvertFrom-Json -AsHashtable
            foreach ($k in $config.Keys) { $viejo[$k] = $config[$k] }
            $config = $viejo
        }
        if (-not $Simular) { $config | ConvertTo-Json | Set-Content -Path $cfgPath -Encoding utf8 }
        Ok 'public/config.json actualizado'
    }
    if (Correr 'npm run build') { npm run build; Revisar 'npm run build' }
    if (-not (Confirmar "¿Publicar la app y las reglas de seguridad en https://$ProyectoId.web.app?")) { return }
    if (Correr 'firebase deploy') { npx firebase deploy --only 'hosting,firestore' --project $ProyectoId; Revisar 'firebase deploy' }

    Paso 'Listo'
    Ok "Abre https://$ProyectoId.web.app en el celular, inicia sesión, crea tu equipo y toca «Invitar»."
    Ok 'Para avisos: Perfil → «Activar en este dispositivo». En iPhone primero «Agregar a inicio».'
}
catch {
    Write-Host "`n✗ $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
