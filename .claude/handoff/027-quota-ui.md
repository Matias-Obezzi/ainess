# Cuota visible: en la jerarquía y debajo del input, y botón de enviar dentro del input

Repo: C:\Users\matia\Desktop\projects\ais-wt-quota (worktree, rama `feat/quota-ui`)
Rama: la que esté activa en ese worktree, sin cambiar de rama ni crear otras.

## Objetivo

1. Que en la vista de jerarquía cada agente muestre cuánta cuota le queda.
2. Que debajo del input, en la misma fila de los selects y pegado a la derecha, haya un indicador
   circular con la cuota que le queda al agente con el que estás hablando (el orquestador en el hilo
   del proyecto, o el agente del chat), y que al hacer click se abra el detalle por agente.
3. Que el botón de enviar pierda el texto y quede como un ícono dentro del input, como en Claude.

## Contexto

Leé `PLAN.md` antes de empezar; la sección "Modelos y cuota" explica de dónde sale cada dato.

- `src/lib/quota.ts` ya trae la cuota por proveedor: `fetchQuota(provider)` devuelve
  `ProviderQuota { provider, status: "ok" | "unavailable" | "error", message?, fetchedAt, items }`.
- `QuotaItem` (en `src/types.ts:297`) tiene `label`, `model?`, `remaining?`, `entitlement?`,
  `percentRemaining?`, `usedPercent?`, `unlimited?`, `resetsAt?`, `note?`. Un item **sin** `model` es
  global del proveedor; uno **con** `model` aplica a ese modelo (o a ese pool, en Antigravity).
- El store tiene `quota: Partial<Record<ProviderId, ProviderQuota>>` y las acciones que la refrescan
  (`refreshQuota`, ver alrededor de `src/store.ts:883`). También `models` por proveedor y
  `config.autoModel` (cuando está en true, el modelo lo elige el orquestador).
- `formatQuotaLine(item)` y `formatResetsAt(ms)` en `quota.ts` ya arman texto legible: reusalos para
  los detalles en vez de inventar formato nuevo.
- Los agentes viven en `config.agents` (`AgentConfig`: `id`, `name`, `provider`, `model?`, `role`,
  `parentId`, `color`). El agente sin `parentId` es el orquestador.
- La jerarquía se dibuja en `src/components/AgentNode.tsx` (nodo) y `src/components/HierarchyGraph.tsx`.
- El input está en `src/components/shell/Composer.tsx`; la fila de selects es la que tiene el destino
  y el modelo.

## Cambios

### 1. `src/lib/quota-summary.ts` (nuevo, puro y testeado)

```ts
export interface QuotaSummary {
  /** Remaining share, 0..1, or null when the provider does not report enough to know. */
  fraction: number | null;
  /** Compact label for the ring: "62%", "12/50" or "∞". */
  label: string;
  /** One line for the tooltip: what it is and when it resets. */
  detail: string;
  status: "ok" | "unavailable" | "error" | "exhausted";
}

/**
 * Narrows a provider's quota to what one agent can actually use: the items of its model plus the
 * provider-wide ones. With `allModels` (the agent lets the orchestrator pick), every model of that
 * provider counts, so the summary is the total left over the total available.
 */
export function summarizeAgentQuota(
  quota: ProviderQuota | undefined,
  opts: { model?: string; allModels?: string[] },
): QuotaSummary;
```

Reglas:

- Sin `quota` o con `status !== "ok"`: `fraction: null`, `status` heredado (`"unavailable"` si no hay
  dato), y `detail` con el `message` si viene.
- Items `unlimited`: no aportan al total; si **todos** los que aplican son ilimitados, `fraction: 1`,
  `label: "∞"`.
- Con `remaining` y `entitlement` en varios items: `fraction = suma(remaining) / suma(entitlement)`,
  `label = "<suma remaining>/<suma entitlement>"`.
- Sin esos números pero con `percentRemaining`: promedio de los porcentajes, `label = "NN%"`.
- Con `usedPercent` (ventanas de Claude Code): `fraction = 1 - usedPercent/100`.
- `fraction <= 0` → `status: "exhausted"`.
- El `detail` sale de `formatQuotaLine` del item que manda, más `formatResetsAt(resetsAt)` cuando hay.

### 2. `src/components/QuotaRing.tsx` (nuevo)

Anillo circular en SVG, como el de Claude: un círculo de fondo y un arco con el `fraction`.

```tsx
export function QuotaRing({ fraction, size = 18, label, className }: {
  fraction: number | null; size?: number; label?: string; className?: string;
}): JSX.Element
```

- `fraction === null`: anillo gris tenue, sin arco.
- Color por nivel: arriba de 0.5 `text-emerald-500`, entre 0.2 y 0.5 `text-amber-500`, abajo
  `text-destructive`. Usá `currentColor` en el arco.
- Sin texto adentro (a 18 px no entra); el número va al lado o en el tooltip, según el lugar.
- `aria-label` con el porcentaje para que sea legible por lectores de pantalla.

### 3. Jerarquía: cuota por agente

En `src/components/AgentNode.tsx`, junto al estado del agente, mostrá `QuotaRing` con el resumen de
ese agente más el `label` al lado en `text-[10px] text-muted-foreground`. El tooltip del nodo suma
una línea con el `detail`.

- Si `config.autoModel` está activo, el resumen usa `allModels` (todos los modelos de ese proveedor,
  de `store.models[provider]` con respaldo en `PROVIDERS[provider].defaultModels`), o sea "lo que
  queda sobre el total de todos los modelos de ese agente".
- Si no, usa el `model` del agente.
- Cuando no hay dato (`fraction === null`), mostrá el anillo apagado sin número: nada de "0%".

### 4. Composer: indicador a la derecha de la fila de selects

En `src/components/shell/Composer.tsx`, al final de la fila de selects y con `ml-auto`, un botón
fantasma con el `QuotaRing` del agente destino:

- En el hilo del proyecto, el agente destino es el orquestador (el que no tiene `parentId`).
- En un chat con un solo agente, es ese agente.
- Al hacer click abre un `Popover` (usá `src/components/ui/popover.tsx` si existe; si no, agregalo del
  registry igual que los otros) con el detalle **por agente**: una fila por cada agente del proyecto
  con su avatar/logo (`AgentAvatar` de `src/components/ProviderLogo.tsx`), su nombre, su `QuotaRing`,
  el `label` y el `detail` en chico.
- Con `autoModel` activo, cada fila muestra el total sobre el total de todos los modelos de ese
  agente (o sea, el mismo criterio de `allModels` del punto 3), y el popover aclara arriba que el
  modelo lo elige el orquestador.
- El popover trae un botón "Actualizar" que llama a la acción del store que refresca la cuota de los
  proveedores involucrados.

### 5. Botón de enviar dentro del input

En el mismo `Composer.tsx`:

- El botón pasa a ser `size="icon"` sin texto, posicionado dentro del `textarea` abajo a la derecha
  (contenedor `relative`, botón `absolute bottom-2 right-2`), con `padding-right` en el textarea para
  que el texto no pase por debajo.
- Mantiene el comportamiento que ya tiene: ícono de enviar cuando se puede mandar, ícono de detener
  cuando hay algo corriendo, deshabilitado cuando corresponde, y el `title`/`aria-label` que diga qué
  hace ("Enviar (Enter)" / "Detener").
- No cambies los atajos de teclado ni la lógica de envío.

### 6. Tests

`src/lib/__tests__/quota-summary.test.ts`, sobre `summarizeAgentQuota`:

- Suma `remaining`/`entitlement` de varios items del mismo modelo.
- Promedia `percentRemaining` cuando no hay números absolutos.
- `usedPercent: 80` → `fraction` 0.2.
- Todos ilimitados → `fraction` 1 y `label` "∞".
- `quota` ausente o con `status: "error"` → `fraction: null` y el status correcto.
- `remaining: 0` → `status: "exhausted"`.
- Con `allModels`, junta los items de todos esos modelos y no los de otros proveedores.

Los tests que ya existen tienen que seguir pasando sin tocarlos.

### 7. `PLAN.md`

Sumá a la sección "Modelos y cuota" un párrafo sobre dónde se muestra ahora la cuota (nodo de la
jerarquía y Composer), qué hace `summarizeAgentQuota` y la regla de `autoModel`.

## Casos borde y decisiones ya tomadas

- Nunca pidas cuota nueva al montar cada nodo: usá lo que ya está en el store y dejá que el botón
  "Actualizar" del popover sea el que refresca.
- Un proveedor sin binario detectado no tiene cuota: anillo apagado, sin error rojo.
- Si el proyecto no tiene agentes, el indicador del Composer no se muestra.
- No agregues dependencias nuevas: el anillo es SVG a mano.
- Código en inglés, UI en español.

## Fuera de alcance

- La vista remota (`src/remote/**`).
- Cambiar cómo se obtiene la cuota (`src/lib/quota.ts` no se toca, salvo para exportar algo que
  necesites reusar).
- El menú contextual de los nodos: hay otro trabajo en curso sobre `AgentNode.tsx`, así que tocá lo
  mínimo ahí y no reordenes el archivo.
- Nada de push: solo commits locales.

## Verificación

Desde la raíz del worktree:

```
npx tsc --noEmit
npm test
npm run build
```

Todo tiene que pasar sin warnings nuevos.
