#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Puts built bundles on prod-zephyrex-rpg. Never touches /etc/zephyrex-rpg/*.env: the pipeline
# owns those.
#
# It places them and try-restarts the units, which starts nothing that is stopped: the pipeline
# owns enabling them (framework_app_enabled). For now they run for the operator's internal testing
# (operator, 2026-11-21: deploy now, internal only, no public edge until the network security audit
# of 2026-11-04's rule). Launch adds a health check per part, with the previous bundle restored
# when a part does not come up (SOP: Zephyrex Framework SaaS Launch).
#
# Usage: deploy/ship.sh <server bundle> <client bundle>
# Environment: RPG_AI_DEPLOY_HOST, RPG_AI_DEPLOY_USER, RPG_AI_DEPLOY_KEY
#              (private key), RPG_AI_DEPLOY_KNOWN_HOSTS (the pinned host key line).
set -euo pipefail

server=$(realpath "$1")
client=$(realpath "$2")
: "${RPG_AI_DEPLOY_HOST:?}" "${RPG_AI_DEPLOY_USER:?}" "${RPG_AI_DEPLOY_KEY:?}" "${RPG_AI_DEPLOY_KNOWN_HOSTS:?}"

secrets=$(mktemp -d)
trap 'rm -rf "$secrets"' EXIT
umask 077
printf '%s\n' "$RPG_AI_DEPLOY_KEY" > "$secrets/key"
printf '%s\n' "$RPG_AI_DEPLOY_KNOWN_HOSTS" > "$secrets/known_hosts"
ssh_opts=(-i "$secrets/key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$secrets/known_hosts" -o ConnectTimeout=15)
target="$RPG_AI_DEPLOY_USER@$RPG_AI_DEPLOY_HOST"

# Fail fast, before anything changes, if prod-zephyrex-rpg cannot be reached at all.
if ! ssh "${ssh_opts[@]}" "$target" true; then
  echo "cannot reach $target over ssh; prod is unchanged" >&2
  exit 1
fi
remote() { ssh "${ssh_opts[@]}" "$target" "$@"; }
sync() { rsync -a --delete -e "ssh ${ssh_opts[*]}" "$1/" "$target:$2/"; }

# Place one part, keeping what was there as <dir>.previous for a rollback.
place() {
  local bundle=$1 dir=$2
  remote "if [ -d $dir ]; then rsync -a --delete $dir/ $dir.previous/; fi"
  sync "$bundle" "$dir"
  echo "$dir: placed"
}

place "$server" /srv/zephyrex-rpg/server
place "$client" /srv/zephyrex-rpg/client
# Restart what runs: a no-op while the units are stopped (until the pipeline enables them), and
# the new bundles take effect on every deploy after. The deploy user's sudoers allows only
# try-restart and status for these two units.
remote "sudo systemctl try-restart zephyrex-rpg-server zephyrex-rpg-client"
remote "systemctl is-active zephyrex-rpg-server zephyrex-rpg-client || true"
echo "placed; running units restarted (stopped ones stay stopped)"
