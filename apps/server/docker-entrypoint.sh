#!/bin/sh
# The image runs as `node`. Railway mounts volumes as root and starts the container as root
# (RAILWAY_RUN_UID=0) so the snapshot directory can be handed to `node` here; the server never runs as root.
set -eu

if [ "$(id -u)" = 0 ]; then
  if [ -n "${ROOMS_SNAPSHOT_PATH:-}" ]; then
    dir=$(dirname "$ROOMS_SNAPSHOT_PATH")
    # Only the snapshot's own directory and file, never recursively, and never the filesystem root.
    if [ "$dir" != / ] && [ -d "$dir" ]; then
      chown node:node "$dir"
      if [ -e "$ROOMS_SNAPSHOT_PATH" ]; then chown node:node "$ROOMS_SNAPSHOT_PATH"; fi
    fi
  fi
  exec setpriv --reuid=node --regid=node --init-groups --no-new-privs -- "$@"
fi

exec "$@"
