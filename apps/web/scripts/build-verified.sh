#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node_hint="${1:-${npm_node_execpath:-}}"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

if [[ "$#" -gt 0 ]]; then
  shift
fi

command -v timeout || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

resolve_node_binary() {
  local raw candidate drive rest major
  for raw in "${node_hint}" "${BEDROOM_BUILD_NODE:-}" "${CODEX_MCP_NODE_PATH:-}" "$(command -v node || true)"; do
    [[ -n "${raw}" ]] || continue
    candidate="${raw}"
    if [[ "${candidate}" =~ ^[A-Za-z]:\\ ]]; then
      if command -v wslpath >/dev/null 2>&1; then
        candidate="$(wslpath -u "${candidate}")"
      elif command -v cygpath >/dev/null 2>&1; then
        candidate="$(cygpath -u "${candidate}")"
      else
        drive="$(printf '%s' "${candidate:0:1}" | tr '[:upper:]' '[:lower:]')"
        rest="${candidate:2}"
        rest="${rest//\\//}"
        candidate="/${drive}${rest}"
      fi
    fi
    [[ -x "${candidate}" ]] || continue
    major="$("${candidate}" -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || true)"
    if [[ "${major}" =~ ^[0-9]+$ ]] && (( major >= 22 )); then
      printf '%s\n' "${candidate}"
      return
    fi
  done
}

node_binary="$(resolve_node_binary)"
if [[ -z "${node_binary}" ]]; then
  echo "Node.js is unavailable inside the build environment." >&2
  exit 69
fi

node_major="$("${node_binary}" -p 'Number(process.versions.node.split(".")[0])')"
if (( node_major < 22 )); then
  echo "Node.js 22 or newer is required; found $("${node_binary}" --version)." >&2
  exit 69
fi

node_path() {
  local path="$1"
  if [[ "${node_binary}" == *.exe && "${path}" == /mnt/* && -x "$(command -v wslpath || true)" ]]; then
    wslpath -w "${path}"
  else
    printf '%s\n' "${path}"
  fi
}

vinext_cli_fs="${SITES_WORKSPACE_ROOT}/node_modules/vinext/dist/cli.js"
if [[ ! -f "${vinext_cli_fs}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi
vinext_cli="$(node_path "${vinext_cli_fs}")"
sync_assets_script="$(node_path "${SITES_PROJECT_ROOT}/scripts/sync-furniture-assets.mjs")"
client_budget_script="$(node_path "${SITES_PROJECT_ROOT}/scripts/check-client-budgets.mjs")"

echo "Running bounded vinext build..."
"${node_binary}" "${sync_assets_script}" --check
timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
  "${node_binary}" "${vinext_cli}" build

echo "Checking client chunk boundaries and size budgets..."
"${node_binary}" "${client_budget_script}"

echo "Running automated tests..."
test_files=()
for test_file in "${SITES_PROJECT_ROOT}"/tests/*.test.mjs; do
  test_files+=("$(node_path "${test_file}")")
done
"${node_binary}" --test "${test_files[@]}"
