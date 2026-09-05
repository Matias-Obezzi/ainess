#!/usr/bin/env bash
# Despacha un plan a Antigravity (agy CLI) en modo headless y guarda el resultado.
# Uso: .claude/scripts/agy-run.sh <plan.md> [--model <id>] [--timeout <dur>] [--effort low|medium|high]
# Env: AGY_BIN, AGY_PROJECT (nombre del proyecto en Antigravity), AGY_NEW_PROJECT=1 (crea el proyecto),
#      AGY_MODEL, AGY_TIMEOUT, AGY_EFFORT
set -uo pipefail

AGY="${AGY_BIN:-$HOME/.gemini/bin/agy.exe}"
PROJECT="${AGY_PROJECT:-ais}"
MODEL="${AGY_MODEL:-}"
TIMEOUT="${AGY_TIMEOUT:-45m}"
EFFORT="${AGY_EFFORT:-high}"

PLAN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --model)   MODEL="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --effort)  EFFORT="$2"; shift 2 ;;
    *)         PLAN="$1"; shift ;;
  esac
done

if [ -z "$PLAN" ] || [ ! -f "$PLAN" ]; then
  echo "plan no encontrado: '$PLAN'" >&2
  exit 2
fi

PLAN_ABS="$(cd "$(dirname "$PLAN")" && pwd -W 2>/dev/null || pwd)/$(basename "$PLAN")"
BASE="${PLAN_ABS%.md}"
RESULT="$BASE.result.json"
REPORT="$BASE.report.md"
LOG="$BASE.log"

PROMPT=$(cat <<EOF
Sos el agente implementador de este workspace. Un agente planificador ya escribió el plan en:

  $PLAN_ABS

Leé el plan completo antes de tocar nada y ejecutalo de punta a punta. Reglas:

1. Trabajá solo dentro del repo que indica el plan y en la rama que esté activa. No cambies de rama ni crees otras.
2. Hacé git commit temprano y seguido, con mensajes en inglés que describan el cambio. No hagas push.
3. Corré las verificaciones que pide el plan (tests, typecheck, lint, build). Si algo falla, arreglalo antes de terminar.
4. No pidas confirmación ni hagas preguntas: si el plan es ambiguo, tomá la decisión más conservadora y anotala en el informe.
5. Al terminar, escribí un informe en markdown en:
     $REPORT
   con estas secciones: Qué se hizo, Commits (hash y mensaje), Verificación (qué corriste y resultado), Decisiones tomadas, Pendientes o dudas.
6. Tu respuesta final debe ser un resumen de 3 a 5 líneas, en español.
EOF
)

ARGS=(--dangerously-skip-permissions --output-format json --print-timeout "$TIMEOUT" --effort "$EFFORT")
if [ "${AGY_NEW_PROJECT:-}" = "1" ]; then
  ARGS+=(--new-project)
else
  ARGS+=(--project "$PROJECT")
fi
[ -n "$MODEL" ] && ARGS+=(--model "$MODEL")

echo "agy → $(basename "$PLAN") (project=$PROJECT, model=${MODEL:-default}, effort=$EFFORT, timeout=$TIMEOUT)" >&2
"$AGY" "${ARGS[@]}" -p "$PROMPT" >"$RESULT" 2>"$LOG"
CODE=$?

if command -v node >/dev/null 2>&1 && [ -s "$RESULT" ]; then
  node -e '
    const fs=require("fs"); const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    console.log(`status: ${r.status}  conversation: ${r.conversation_id}  turns: ${r.num_turns}  ${Math.round(r.duration_seconds)}s`);
    if (r.error) console.log(`error: ${r.error}`);
    if (r.usage) console.log(`tokens: in=${r.usage.input_tokens} out=${r.usage.output_tokens} total=${r.usage.total_tokens}`);
    console.log("---"); console.log((r.response||"").trim());
  ' "$RESULT" 2>/dev/null || cat "$RESULT"
else
  cat "$RESULT"
fi

[ -f "$REPORT" ] && echo "informe: $REPORT" || echo "sin informe (el agente no escribió $REPORT)" >&2
exit $CODE
