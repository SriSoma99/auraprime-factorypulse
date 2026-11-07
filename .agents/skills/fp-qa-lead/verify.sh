#!/usr/bin/env bash
# fp-qa-lead gate runner: observed results only (SKILL.md "Gate decision").
# Anything not run is reported as not run, never as passed.
#
# Usage:
#   bash .agents/skills/fp-qa-lead/verify.sh            full gate, exit 0 = go / go with conditions, 1 = no-go
#   bash .agents/skills/fp-qa-lead/verify.sh --quick    skip typecheck and tests (integrity, contract, traceability only)
#   bash .agents/skills/fp-qa-lead/verify.sh --hook     for a Claude Code Stop hook: exit 2 on no-go, summary on stderr
#
# Environment (all optional):
#   FP_QA_BASE   git ref the integrity check diffs tests against (default HEAD; set to the run's start commit)
#   FP_QA_OUT    report directory (default: a temp dir outside the repo)
#   FP_QA_E2E=1  also run Playwright (needs dev:api and dev:app running)
set -uo pipefail

MODE="full"; HOOK=0
for a in "$@"; do
  case "$a" in
    --quick) MODE="quick" ;;
    --hook)  HOOK=1 ;;
    *) echo "unknown option: $a" >&2; exit 64 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "not in a git repository" >&2; exit 64; }
cd "$ROOT" || exit 64
BASE="${FP_QA_BASE:-HEAD}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${FP_QA_OUT:-${TMPDIR:-/tmp}/fp-qa/$STAMP}"
mkdir -p "$OUT"
REPORT="$OUT/report.md"

NOGO=(); COND=(); NOTRUN=()
nogo()   { NOGO+=("$1"); }
cond()   { COND+=("$1"); }
notrun() { NOTRUN+=("$1"); }
say()    { printf '%s\n' "$*" >> "$REPORT"; }

# ---------------------------------------------------------------- run record (SKILL.md test rules)
COMMIT="$(git rev-parse --short HEAD)"
DIRTY="$(git status --porcelain | wc -l | tr -d ' ')"
CFG_HASH="$(cat config/build.json config/editions/*.json config/environments/*.json 2>/dev/null | sha256sum | cut -c1-12)"
{
  echo "# QA gate report"
  echo
  echo "| Field | Value |"
  echo "|---|---|"
  echo "| Run | $STAMP |"
  echo "| Commit | $COMMIT ($DIRTY uncommitted paths) |"
  echo "| Integrity base | $BASE |"
  echo "| Config hash | $CFG_HASH |"
  echo "| Node / pnpm | $(node -v 2>/dev/null) / $(pnpm -v 2>/dev/null) |"
  echo "| Mode | $MODE |"
  echo
} > "$REPORT"

# ---------------------------------------------------------------- 1. local stack
say "## 1. Local stack"
STACK_UP=0
if docker compose -f infra/local/docker-compose.yml --env-file infra/local/.env.local ps --status running --services 2>/dev/null | grep -qx postgres; then
  STACK_UP=1; say "- PostgreSQL container running"
else
  say "- PostgreSQL container NOT running (run \`pnpm local:up\`)"
fi
say ""

# ---------------------------------------------------------------- 2. typecheck
say "## 2. Typecheck"
if [ "$MODE" = "quick" ]; then
  notrun "typecheck (--quick)"; say "- not run (--quick)"
elif pnpm typecheck > "$OUT/typecheck.log" 2>&1; then
  say "- pass"
else
  nogo "typecheck failed"
  say "- **FAIL**"; say '```'; tail -40 "$OUT/typecheck.log" >> "$REPORT"; say '```'
fi
say ""

# ---------------------------------------------------------------- 3. tests per workspace (no bail: every package is observed)
say "## 3. Unit and integration tests (per workspace)"
TOTAL_P=0; TOTAL_F=0; TOTAL_S=0
if [ "$MODE" = "quick" ]; then
  notrun "unit and integration tests (--quick)"; say "- not run (--quick)"
elif [ "$STACK_UP" -eq 0 ]; then
  notrun "unit and integration tests (database not running)"; nogo "tests not run: local stack down"
  say "- not run: local stack down"
else
  say "| Workspace | Passed | Failed | Skipped | Result |"
  say "|---|---|---|---|---|"
  for pj in apps/*/package.json packages/*/package.json; do
    dir="$(dirname "$pj")"
    node -e "const p=require('./$pj');process.exit(p.scripts&&p.scripts.test?0:1)" 2>/dev/null || continue
    name="$(node -p "require('./$pj').name")"
    log="$OUT/test-$(basename "$dir").log"
    pnpm --filter "$name" run test > "$log" 2>&1; rc=$?
    line="$(grep -E '^\s+Tests\s' "$log" | tail -1)"
    p="$(sed -nE 's/.* ([0-9]+) passed.*/\1/p' <<< "$line")"; p="${p:-0}"
    f="$(sed -nE 's/.* ([0-9]+) failed.*/\1/p' <<< "$line")"; f="${f:-0}"
    s="$(sed -nE 's/.* ([0-9]+) skipped.*/\1/p' <<< "$line")"; s="${s:-0}"
    TOTAL_P=$((TOTAL_P+p)); TOTAL_F=$((TOTAL_F+f)); TOTAL_S=$((TOTAL_S+s))
    if [ "$rc" -eq 0 ]; then res="pass"; else res="**FAIL**"; nogo "tests failed in $name"; fi
    [ -z "$line" ] && [ "$rc" -ne 0 ] && res="**ERROR (no result line)**"
    say "| $name | $p | $f | $s | $res |"
    if [ "$rc" -ne 0 ]; then
      say ""; say '```'; grep -E 'FAIL |×|AssertionError|Error:' "$log" | head -15 >> "$REPORT"; say '```'; say ""
    fi
  done
  say ""
  say "Total: $TOTAL_P passed, $TOTAL_F failed, $TOTAL_S skipped. Logs: \`$OUT\`"
  [ "$TOTAL_S" -gt 0 ] && cond "$TOTAL_S skipped tests (each needs an owner, SKILL.md test rules)"
fi
say ""

# ---------------------------------------------------------------- 4. end-to-end (opt-in)
say "## 4. End-to-end (Playwright)"
if [ "${FP_QA_E2E:-0}" = "1" ] && [ "$MODE" != "quick" ]; then
  if pnpm test:e2e > "$OUT/e2e.log" 2>&1; then say "- pass"; else nogo "e2e failed"; say "- **FAIL** (see \`$OUT/e2e.log\`)"; fi
else
  notrun "end-to-end (set FP_QA_E2E=1 with dev:api and dev:app running)"; say "- not run"
fi
say ""

# ---------------------------------------------------------------- 5. result integrity: no faked evidence
say "## 5. Result integrity"
INTEG=0
hits="$(grep -rnE 'status:\s*"PASSED"' tools/ 2>/dev/null)"
[ -n "$hits" ] && { nogo "release gate status hard-coded PASSED in tools/"; say "- **Hard-coded gate results:**"; say '```'; say "$hits"; say '```'; INTEG=1; }
hits="$(grep -rnE '\bchecks\.[A-Za-z]+\s*=\s*true\s*;' tools/ 2>/dev/null)"
[ -n "$hits" ] && { nogo "a check result is assigned true without being computed"; say "- **Uncomputed check results:**"; say '```'; say "$hits"; say '```'; INTEG=1; }
hits="$(grep -rnE '(Verified|verified)\s*:\s*true|Status\s*:\s*"signed"' apps/app/src/features --include='use*VM.ts' 2>/dev/null)"
[ -n "$hits" ] && { nogo "a ViewModel shows a hard-coded verified or signed claim"; say "- **UI claims with no data source:**"; say '```'; say "$hits"; say '```'; INTEG=1; }
hits="$(grep -rnE '\b(it|test|describe)\.(skip|only)\(|\bit\.todo\(' apps packages --include='*.test.ts' --include='*.spec.ts' 2>/dev/null | grep -v node_modules)"
[ -n "$hits" ] && { nogo "skipped or focused tests present"; say "- **.skip / .only / .todo:**"; say '```'; say "$hits"; say '```'; INTEG=1; }
if git rev-parse -q --verify "$BASE" >/dev/null; then
  removed="$(git diff "$BASE" -- '*.test.ts' '*.spec.ts' | grep -cE '^-[^-].*\bexpect\(')"
  added="$(git diff "$BASE" -- '*.test.ts' '*.spec.ts' | grep -cE '^\+[^+].*\bexpect\(')"
  if [ "$removed" -gt "$added" ]; then
    cond "net $((removed-added)) assertions removed since $BASE: owner must confirm none were weakened"
    say "- Assertions since $BASE: $removed removed, $added added (net loss: review the diff)"; INTEG=1
  else
    say "- Assertions since $BASE: $removed removed, $added added"
  fi
fi
[ "$INTEG" -eq 0 ] && say "- clean"
say ""

# ---------------------------------------------------------------- 6. contract drift (ADR-030: the contract is the source of truth)
say "## 6. API contract drift (doc/api/openapi.yaml vs apps/mock-api)"
contract="$(grep -oE '^  /[^:]+' doc/api/openapi.yaml | sed -E 's/^  //; s/\{([^}]+)\}/:\1/g' | sort -u)"
# Route registrations may span lines (typed generics), so match across newlines.
served="$(cat apps/mock-api/src/routes/*.ts \
          | perl -0777 -ne 'while (/\bapp\.(?:get|post|put|patch|delete)\b[\s\S]{0,400}?\(\s*"(\/[^"]*)"/g) { print "$1\n" }' \
          | sort -u)"
undocumented="$(comm -13 <(echo "$contract") <(echo "$served"))"
unserved="$(comm -23 <(echo "$contract") <(echo "$served"))"
if [ -n "$undocumented" ]; then
  nogo "mock API serves paths missing from the contract"
  say "- **Served but not in the contract:**"; say '```'; say "$undocumented"; say '```'
fi
[ -n "$unserved" ] && { cond "contract paths not served by the mock API"; say "- In the contract but not served:"; say '```'; say "$unserved"; say '```'; }
[ -z "$undocumented$unserved" ] && say "- in sync ($(echo "$contract" | grep -c .) paths)"
say ""

# ---------------------------------------------------------------- 7. traceability (SKILL.md responsibility 2)
say "## 7. Requirement traceability"
IDRE='\b((ING|DET|TRU|LIM|RAG|AGT|POL|LRN|FBK|OBS|MCP|API|SIM|UI|REG|IP)-[0-9]+|NFR-[RPSCM][0-9]+|AC-H[0-9]+|CS-[A-Z])\b'
REQ=doc/req/00-requirements.md
# Defined = first cell of a table row in the requirements document.
defined="$(grep -oE "^\| *$IDRE *\|" "$REQ" | grep -oE "$IDRE" | sort -u)"
must="$(awk -F'|' '{gsub(/ /,"",$2); gsub(/ /,"",$4)} $4=="M"{print $2}' "$REQ" | grep -E "^$IDRE\$" | sort -u)"
tested="$(grep -rhoE "$IDRE" apps packages --include='*.test.ts' --include='*.spec.ts' 2>/dev/null | sort -u)"
# The delivery plan is internal and absent from the public export (ADR-036).
cited_plan="$( [ -f doc/11-project-plan.md ] && grep -oE "$IDRE" doc/11-project-plan.md | sort -u)"
cited_tests="$tested"
undef_plan="$(comm -23 <(echo "$cited_plan") <(echo "$defined"))"
undef_tests="$(comm -23 <(echo "$cited_tests") <(echo "$defined"))"
untested_must="$(comm -23 <(echo "$must") <(echo "$tested"))"
say "- Requirement IDs defined: $(echo "$defined" | grep -c .); Must: $(echo "$must" | grep -c .); referenced by at least one test: $(echo "$tested" | grep -c .)"
if [ -n "$undef_plan$undef_tests" ]; then
  nogo "IDs cited that are not defined in the requirements (SKILL.md: never invent IDs)"
  [ -n "$undef_plan" ]  && { say "- **Cited in doc/11 but undefined:** $(echo $undef_plan)"; }
  [ -n "$undef_tests" ] && { say "- **Cited in tests but undefined:** $(echo $undef_tests)"; }
fi
if [ -n "$untested_must" ]; then
  cond "$(echo "$untested_must" | grep -c .) Must requirements with no test naming them directly"
  say "- Must requirements with no test naming them directly (range citations such as RAG-1..10 count only the first ID; confirm by hand):"
  say '```'; echo "$untested_must" | paste -sd' ' >> "$REPORT"; say '```'
fi
say ""

# ---------------------------------------------------------------- 8. hardcoding scan (fp-engineering-principles), warning only
say "## 8. Literal scan in non-test source (warning)"
lits="$(grep -rnE 'https?://|localhost|127\.0\.0\.1|gemini-|gpt-|claude-|[0-9]+_000\b' apps packages tools \
        --include='*.ts' --include='*.tsx' --include='*.mjs' 2>/dev/null \
        | grep -vE 'node_modules|\.test\.ts|\.spec\.ts|schema\.gen\.ts|/e2e/|packages/config/src/schema\.ts')"
n="$(echo "$lits" | grep -c .)"
if [ "$n" -gt 0 ]; then
  cond "$n literal hosts, URLs, model names or durations in source (each must be a config key or named fixture)"
  say "- $n hits (first 20):"; say '```'; echo "$lits" | head -20 | cut -c1-160 >> "$REPORT"; say '```'
else
  say "- clean"
fi
say ""

# ---------------------------------------------------------------- 9. suites this script cannot run
for s in "scenario and benchmark scoring (SIM-4)" "chaos and failure injection (NFR-R6)" "performance (NFR-P1..P3)" \
         "dependency and image scanning, SBOM (NFR-S5)" "cloud validation window"; do
  notrun "$s: not covered by verify.sh; needs its own observed run"
done

# ---------------------------------------------------------------- verdict
if [ "${#NOGO[@]}" -gt 0 ]; then VERDICT="NO-GO"
elif [ "${#COND[@]}" -gt 0 ] || [ "${#NOTRUN[@]}" -gt 0 ]; then VERDICT="GO WITH CONDITIONS"
else VERDICT="GO"; fi

SUMMARY="$( {
  echo "QA gate: $VERDICT  (commit $COMMIT, report $REPORT)"
  for x in "${NOGO[@]}";   do echo "  no-go:     $x"; done
  for x in "${COND[@]}";   do echo "  condition: $x"; done
  for x in "${NOTRUN[@]}"; do echo "  not run:   $x"; done
} )"
{ echo "## Verdict: $VERDICT"; echo; echo '```'; echo "$SUMMARY"; echo '```'; } >> "$REPORT"

if [ "$HOOK" -eq 1 ]; then
  if [ "$VERDICT" = "NO-GO" ]; then
    { echo "$SUMMARY"; echo; echo "Fix the no-go items before finishing. Do not weaken tests, skip tests or hard-code results."; } >&2
    exit 2
  fi
  exit 0
fi
echo "$SUMMARY"
[ "$VERDICT" = "NO-GO" ] && exit 1 || exit 0
