#!/usr/bin/env bash
# Despacha un plan a GitHub Copilot CLI en modo headless y guarda el resultado.
# Uso: .claude/scripts/copilot-run.sh <plan.md> [--model <id>] [--timeout <dur>] [--repo <dir>]
# Env: COPILOT_BIN, COPILOT_MODEL (default claude-opus-5), COPILOT_TIMEOUT (default 90m),
#      COPILOT_REPO (directorio del repo/worktree donde trabajar; default: raíz del repo del plan)
set -uo pipefail

WINGET_COPILOT="$LOCALAPPDATA/Microsoft/WinGet/Packages/GitHub.Copilot_Microsoft.Winget.Source_8wekyb3d8bbwe/copilot.exe"
COPILOT="${COPILOT_BIN:-$(command -v copilot 2>/dev/null || echo "$WINGET_COPILOT")}"
MODEL="${COPILOT_MODEL:-claude-opus-5}"
TIMEOUT="${COPILOT_TIMEOUT:-90m}"
REPO="${COPILOT_REPO:-}"

PLAN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --model)   MODEL="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --repo)    REPO="$2"; shift 2 ;;
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
[ -z "$REPO" ] && REPO="$(cd "$(dirname "$PLAN")/../.." && pwd -W 2>/dev/null || pwd)"

PROMPT=$(cat <<EOF
Sos el agente implementador de este workspace. Un agente planificador ya escribió el plan en:

  $PLAN_ABS

El repo donde tenés que trabajar es: $REPO

Leé el plan completo antes de tocar nada y ejecutalo de punta a punta. Reglas:

1. Trabajá solo dentro de ese repo y en la rama que esté activa. No cambies de rama ni crees otras.
2. Hacé git commit temprano y seguido, con mensajes en inglés que describan el cambio. No hagas push.
3. Corré las verificaciones que pide el plan (tests, typecheck, lint, build). Si algo falla, arreglalo antes de terminar.
4. No pidas confirmación ni hagas preguntas: si el plan es ambiguo, tomá la decisión más conservadora y anotala en el informe.
5. Al terminar, escribí un informe en markdown en:
     $REPORT
   con estas secciones: Qué se hizo, Commits (hash y mensaje), Verificación (qué corriste y resultado), Decisiones tomadas, Pendientes o dudas.
6. Tu respuesta final debe ser un resumen de 3 a 5 líneas, en español.
EOF
)

echo "copilot → $(basename "$PLAN") (repo=$REPO, model=$MODEL, timeout=$TIMEOUT)" >&2
timeout "$TIMEOUT" "$COPILOT" -p "$PROMPT" -C "$REPO" --add-dir "$REPO" --model "$MODEL" \
  --yolo --no-ask-user --no-color --no-auto-update --no-remote --output-format json -s \
  >"$RESULT" 2>"$LOG"
CODE=$?

if command -v node >/dev/null 2>&1 && [ -s "$RESULT" ]; then
  node -e '
    const fs=require("fs"); const lines=fs.readFileSync(process.argv[1],"utf8").split(/\r?\n/).filter(Boolean);
    let last="", session="", exit=null, usage=null, tools=0;
    for (const l of lines) { let o; try { o=JSON.parse(l); } catch { continue; }
      if (o.type==="assistant.message" && o.data?.content) last=o.data.content;
      if (o.type==="tool.execution_start") tools++;
      if (o.type==="result") { session=o.sessionId; exit=o.exitCode; usage=o.usage; } }
    console.log(`session: ${session}  exit: ${exit}  tools: ${tools}  premium: ${usage?.premiumRequests ?? "?"}  ${Math.round((usage?.sessionDurationMs||0)/1000)}s`);
    console.log("---"); console.log(last.trim());
  ' "$RESULT" 2>/dev/null || tail -c 2000 "$RESULT"
else
  tail -c 2000 "$RESULT"
fi

[ -f "$REPORT" ] && echo "informe: $REPORT" || echo "sin informe (el agente no escribió $REPORT)" >&2
exit $CODE
