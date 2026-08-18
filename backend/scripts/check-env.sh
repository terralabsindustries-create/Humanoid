#!/usr/bin/env bash
# Verifies backend/.env is actually saved, correct, and picked up by the
# running server. Never prints a secret — only lengths and prefixes.
#
#   pnpm --filter backend env:check
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ok=0; warn=0; fail=0
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; ok=$((ok + 1)); }
note() { printf '  \033[33m!\033[0m %s\n' "$1"; warn=$((warn + 1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail + 1)); }

value_of() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d ' "'; }

echo
echo "backend/.env"
if [ ! -f .env ]; then
  bad ".env does not exist — copy .env.example to .env first"
  exit 1
fi
pass "exists, last saved $(stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' .env)"

# --- the leak check: secrets must never be in the tracked template ----------
if grep -qE '^[A-Z_]+=(sk-|gsk_|AIza|SK[a-f0-9]{30})' .env.example 2>/dev/null; then
  bad ".env.example contains a real secret — remove it, that file is COMMITTED"
else
  pass ".env.example holds no secrets (it is tracked by git)"
fi

# --- which model provider is live ------------------------------------------
echo
echo "AI provider"
provider=$(value_of LLM_PROVIDER); provider=${provider:-anthropic}
case "$provider" in
  openai)
    key=$(value_of LLM_API_KEY); model=$(value_of LLM_MODEL); base=$(value_of LLM_BASE_URL)
    if [ -n "$key" ]; then
      pass "LLM_PROVIDER=openai, key set (${#key} chars, ${key:0:4}…)"
      pass "model: ${model:-<default>}  via ${base:-<default>}"
    else
      bad "LLM_PROVIDER=openai but LLM_API_KEY is empty — the line will not reply"
    fi
    ;;
  *)
    key=$(value_of ANTHROPIC_API_KEY); model=$(value_of ANTHROPIC_MODEL)
    if [ -z "$key" ]; then
      bad "ANTHROPIC_API_KEY is empty — the line answers but will not reply"
    elif [ "${key#sk-ant-}" = "$key" ]; then
      bad "ANTHROPIC_API_KEY does not start with sk-ant- — wrong value pasted"
    else
      pass "LLM_PROVIDER=anthropic, key set (${#key} chars, sk-ant-…)"
      pass "model: ${model:-claude-opus-5}"
    fi
    ;;
esac

# --- the restart trap: --env-file is only read at boot ----------------------
echo
echo "running server"
pid=$(lsof -nP -iTCP:"$(value_of PORT || echo 4000)" -sTCP:LISTEN -t 2>/dev/null | head -1)
if [ -z "$pid" ]; then
  note "not running — start it with: pnpm dev"
else
  started=$(date -j -f "%c" "$(ps -o lstart= -p "$pid" | sed 's/^ *//')" "+%s" 2>/dev/null || echo 0)
  edited=$(stat -f '%m' .env)
  if [ "$started" -gt 0 ] && [ "$edited" -gt "$started" ]; then
    bad "server (pid $pid) started BEFORE the last .env save — restart it or your edit is ignored"
  else
    pass "server (pid $pid) started after the last .env save"
  fi
fi

echo
if [ "$fail" -gt 0 ]; then
  printf '\033[31m%d problem(s) to fix above.\033[0m\n\n' "$fail"; exit 1
fi
printf '\033[32mAll good — %d checks passed%s.\033[0m\n\n' "$ok" "$([ "$warn" -gt 0 ] && echo ", $warn note(s)")"
