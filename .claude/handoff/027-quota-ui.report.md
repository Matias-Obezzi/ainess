# Informe — 027 Cuota visible

## Qué se hizo

**`src/lib/quota-summary.ts` (nuevo, puro)** — `summarizeAgentQuota(quota, { model?, allModels? })`
devuelve `{ fraction, label, detail, status }`. Filtra los items del proveedor a los que le sirven al
agente (los globales sin `model` más los que matchean su modelo) y calcula, en este orden:
suma de `remaining`/`entitlement` → promedio de `percentRemaining` → `1 - usedPercent/100` de la
ventana más ajustada → todos `unlimited` = `∞`. `fraction <= 0` da `status: "exhausted"`; sin `quota`
o con `status !== "ok"` da `fraction: null` con el status y el `message` del proveedor.

**`src/components/QuotaRing.tsx` (nuevo)** — anillo SVG a mano (sin dependencias nuevas): círculo de
fondo al 20% de opacidad y arco con el `fraction`, arrancando a las 12 en sentido horario. Color por
nivel (`text-emerald-500` > 0.5, `text-amber-500` 0.2–0.5, `text-destructive` abajo,
`text-muted-foreground/40` cuando no hay dato) y `aria-label` con el porcentaje. El archivo también
exporta el hook `useAgentQuota(agent)`, que arma el resumen con lo que ya está en el store y nunca
dispara un fetch, y `useProviderModels(provider)`.

**`src/components/AgentNode.tsx`** — en la fila del estado, pegado a la derecha, el anillo (14 px) con
el `label` en `text-[10px] text-muted-foreground` y el `detail` en el tooltip. Cuando
`fraction === null` se ve el anillo apagado y sin número. Se tocó lo mínimo: dos líneas de import y
hook, el bloque nuevo, y se le sacó el `ml-auto` al badge de "ocupado en otro proyecto" para que no
compitiera con el del anillo.

**`src/components/QuotaIndicator.tsx` (nuevo)** — el botón fantasma del final de la fila de selects
del Composer: anillo + label del agente destino y, al hacer click, un popover con una fila por agente
(avatar, nombre, anillo, label y `detail` en chico), el botón "Actualizar" (llama a `refreshQuota` de
cada proveedor usado por algún agente, con spinner) y, cuando `autoModel` está activo, la aclaración
de que el modelo lo elige el orquestador.

**`src/components/shell/Composer.tsx`** — el `Textarea` ahora vive en un contenedor `relative` con
`pr-12`, y el botón de enviar/detener es `size="icon"` en `absolute bottom-2 right-2`, sin texto. El
indicador de cuota va al final de la fila de selects con `ml-auto`. La fila de selects solo se
renderiza si hay algo adentro (en un chat compartido sin agente único, no).

**`src/components/ui/popover.tsx`** — instalado del registry `@uiness` con
`npx shadcn@latest add @uiness/popover` (usa el paquete `radix-ui` que ya estaba).

**`src/lib/__tests__/quota-summary.test.ts` (nuevo)** — 11 casos: suma de absolutos, promedio de
porcentajes, `usedPercent: 80` → 0.2, todos ilimitados → `∞`, sin quota, `status: "error"`,
`remaining: 0` → `exhausted`, filtrado por modelo, `allModels`, un item contado una sola vez cuando
varios modelos comparten pool, y los items globales del proveedor.

**`PLAN.md`** — dos párrafos nuevos al final de "Modelos y cuota": qué hace `summarizeAgentQuota`, la
regla de `autoModel`, los colores del anillo y los dos lugares donde se muestra.

## Commits

| Hash | Mensaje |
| --- | --- |
| `7e286fb` | Summarize a provider's quota per agent and draw it as a ring |
| `b8e2f92` | Show the remaining quota in the hierarchy and under the composer |
| `2bd125a` | Document where the quota is shown and how it is summarized |

Sin push, como pedía el plan.

## Verificación

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | OK, sin salida |
| `npm test` | 11 archivos, 113 tests, todos pasan (los 102 que ya existían siguen intactos) |
| `npm run build` | OK (`tsc` + `vite build` + `build:remote`). Los únicos warnings son los de siempre: tamaño de chunk y el `INEFFECTIVE_DYNAMIC_IMPORT` de `orchestrator.ts`, ninguno nuevo |

No se levantó la app (`npm run tauri dev`): el plan pedía esas tres verificaciones y compilar Rust en
este worktree no aportaba nada al cambio, que es puro front.

## Decisiones tomadas

- **Match de item ↔ modelo**: los items traen a veces el id exacto, a veces la familia (`opus`,
  `sonnet` en las ventanas semanales de Claude) y a veces el pool (`gemini`, `claude` en
  Antigravity). Se resuelve con un helper que acepta las tres formas (igualdad, substring y `poolOf`)
  y que junta los items en un solo conjunto, así un item no se cuenta dos veces cuando varios modelos
  de `allModels` caen en el mismo pool.
- **`detail`**: `formatQuotaLine` imprime el reset en UTC porque lo comparte con el CLI. Para la UI se
  llama con `resetsAt: undefined` y se le agrega `· se renueva <formatResetsAt(...)>` en formato
  local, que era la intención del plan (usar los dos helpers) sin duplicar la fecha.
- **Items sin números** (los pools de Antigravity, que solo dicen "Agotado"/"Disponible"):
  `fraction: null` con `status: "ok"`, o sea anillo apagado sin error rojo, pero el `detail` sí
  muestra el estado del pool y cuándo se libera.
- **Agente del indicador del Composer**: el plan decía "el orquestador en el hilo del proyecto". Se
  usa el agente del select de destino, que arranca justamente en el orquestador; así el anillo sigue
  al agente al que realmente le vas a mandar el prompt. En un chat se usa el agente cuando hay uno
  solo; en un chat compartido con varios el indicador no se muestra.
- **Atajo en el `title` del botón de enviar**: el plan sugería "Enviar (Enter)", pero esta app envía
  con `Ctrl+Enter` (así lo dice el placeholder y así está el `handleKeyDown`, que no se tocó), así que
  dice "Enviar (Ctrl+Enter)". El de detener dice "Detener (Esc)".
- **Archivo aparte para el popover**: el plan lo describía dentro de `Composer.tsx`, pero el Composer
  ya es largo; el botón y el popover viven en `QuotaIndicator.tsx` y el Composer solo lo monta.

## Pendientes o dudas

- `package-lock.json` quedó con una modificación local (`"peer": true` en `picomatch`) que ya estaba
  antes de empezar, seguramente de un `npm install` previo en el worktree. No se commiteó por no ser
  parte de este trabajo.
- La vista remota (`src/remote/**`) no muestra la cuota: estaba fuera de alcance.
- El nodo de la jerarquía y el popover leen solo lo que hay en el store, así que arrancan sin dato
  hasta que alguien abra el diálogo de un agente o apriete "Actualizar". Es lo que pedía el plan, pero
  si molesta se podría refrescar una vez al entrar a un proyecto.
