# Reporte de Implementación: B-09 y B-10 (Cuota y Diagnósticos en Remoto)

## Archivos modificados y cambios realizados:
1. **`src/lib/remote.ts`**:
   - Agregué el campo `quota: Partial<Record<ProviderId, ProviderQuota>>` al type `RemoteSnapshot`.
   - Modifiqué `snapshotWith` para incluir `quota: s.quota` en el payload.
   - Agregué el comando `"diagnostics"` en `handleRemoteCommand`, que invoca dinámicamente `@/lib/diagnostics` y evalúa el idioma de la aplicación para crear una función `t` que le permita a `collectDiagnostics` arrojar resultados traducidos.

2. **`src/remote/remote-client.ts`**:
   - Actualicé la función `hydrate` para inyectar `snapshot.quota ?? {}` en el estado de Zustand (`useAppStore.setState`).
   - Agregué la función exportada `runDiagnostics(refreshQuota = false)` que realiza la llamada `/command` a la PC.

3. **`src/remote/RemoteApp.tsx`**:
   - Añadí `quota` en la extracción inicial del store dentro del tab `AgentsTab`.
   - Incluí la renderización del componente `<QuotaRing />` por agente en `AgentsTab`, pasándole el modelo actual del agente a través de `summarizeAgentQuota`.
   - Implementé los componentes `DiagnosticsButton` y `DiagnosticsSheet` simulando el aspecto y diseño original de la interfaz de escritorio pero adaptados a una pantalla de celular completa (`fixed inset-0 z-[100]`).
   - El botón se ubica en el header de `HomeView` y `ProjectView`, y el *sheet* contiene los chequeos con iconos actualizados (`worstLevel`).

4. **`src/i18n/*.ts`** (7 archivos):
   - Agregué la clave `"diagnostics.run"` en las traducciones para el botón principal ("Correr diagnóstico" etc.), en todas las variantes (`es`, `en`, `pt`, `fr`, `de`, `it` como `zh`, `ja`).

5. **`src/lib/__tests__/remote.test.ts`**:
   - Añadí test verificando que `buildSnapshot` ahora incluye el estado de `quota`.
   - Añadí test comprobando que `handleRemoteCommand` pasa los argumentos correctos (`t`, `refreshQuota`) a `collectDiagnostics`.

## Decisión sobre el componente de cuota
Decidí **reutilizar `QuotaRing.tsx`** en lugar de armar algo con sólo texto. Analizando `QuotaRing.tsx`, vi que sus responsabilidades son puramente visuales (recibe `fraction` y `label`). La lógica de estado (calculada con `summarizeAgentQuota`) se extrae fuera del componente, lo que permite instanciar el anillo en `RemoteApp.tsx` enviándole simplemente la información precalculada sin importar dependencias pesadas de Tauri o del backend.

## Verificación
A continuación se muestran los resultados de las comprobaciones exitosas:

- **`npm test`**: Pasaron los 379 tests (incluyendo `remote.test.ts`).
- **`npx tsc --noEmit`**: Compilación exitosa, ningún error de tipos detectado.
- **`cargo check`**: Verificación de dependencias de Rust completada en ~2m 39s (ningún error).
- **`npm run build:remote`**: Compilado (1,180.82 kB -> 355.22 kB).
- **`npm run build:cli`**: Terminado en ~1.3s.
- **`npm run build`**: Terminado exitosamente tras la corrección de tipos.

No hubo cambios en la estructura principal del árbol, ni en otras ramas, y el trabajo puede ser verificado desde la UI levantando el servidor.
