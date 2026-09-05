# Reporte de Implementación: Plan 008 (Detect, Profile, Presets, Models)

## Qué se hizo
Se completó la implementación del plan 008, abordando:
1. **Detección de nuevos providers y overrides manuales**: Se agregó soporte para detectar `ollama`, `aider` y `opencode` en Node y Rust. Se actualizó la estructura `AppConfig` a la v4 para incluir `binaryOverrides`, y se agregó la sección "IAs detectadas" en el `AgentsPanel` con opciones para crear agentes e introducir las rutas a mano de los ejecutables.
2. **Perfil del usuario y órdenes predefinidas**: Se agregó soporte para perfiles y órdenes (presets) en `AppConfig`. Se integraron nuevas pestañas en el `ResourcesPanel` para configurar el perfil del usuario (nombre, acerca de, preferencias) y las órdenes (crear y editar). Se inyectó esta información en el prompt de sistema del orquestador.
3. **Selección de modelos**: Se agregó soporte para seleccionar el modelo por comando en CLI y UI (`PromptPanel`). Se introdujo la opción `autoModel` global para habilitar la delegación automática de modelos por el planificador (en el orquestador).
4. **CLI Updates**: Se implementaron los subcomandos `detect`, `profile` y `presets` en el CLI, junto con la opción `--auto-model` y `--preset` / `--model` en el comando `run`, adaptándolo a las nuevas funciones.

## Commits
* `890bb24` fix(cli): await saveConfig in presets and profile
* `736c8b1` fix: store and ui types and jsx wrapper
* `8a036ec` feat(cli): add detect, profile, presets commands and run options
* `a0d8925` feat(ui): add model selection and presets in UI
* `c0d3c00` feat(ui): add detected providers section and override dialog in AgentsPanel
* `6493594` feat: detect ollama, aider, opencode in Rust and Node
* `cdeef2b` feat: model support in orchestrator (sesión previa)
* `0afda96` feat: providers update and store changes for overrides and models (sesión previa)
* `8955a05` feat: update types for providers, profile, presets and auto-model (sesión previa)

## Verificación
- `npm run build`: Ejecutado y exitoso. Se compilaron el frontend y el CLI correctamente.
- `npx tsc --noEmit`: Ejecutado. Todos los chequeos de tipos pasaron.
- **CLI funcional**: Se validó el comando `ais detect list` y `ais presets add` por consola y funcionan escribiendo en la configuración.

## Decisiones tomadas
- El planificador especificaba `binaryOverrides[provider]`. Decidí implementarlo tal cual, persistiendo las rutas provistas manualmente. Para los providers no detectados automáticamente (o aquellos donde falla la detección), ahora se puede proveer la ruta en el `AgentsPanel`.
- En el `PromptPanel`, se implementaron Selects tanto para "Modelos" como para "Órdenes predefinidas". Si se selecciona "Otro..." en los modelos, aparece un `<input>` libre para permitir modelos personalizados.
- Se debió refinar el tipeo en `store.ts` para arreglar colisiones con la migración de `AppConfig` y errores de compilación dejados por la sesión previa (sobre firmas de llamadas `submitPrompt` sin el modelo en la firma).
- En el CLI, descubrí que al hacer "presets add" el proceso finalizaba sin guardar (debido al guardado debounced que usa el UI), así que añadí explícitamente `await store.saveConfig()` antes del `process.exit` en las rutinas del CLI correspondientes.
