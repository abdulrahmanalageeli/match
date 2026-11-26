#!/bin/bash
set -eu
out="$RUNNER_TEMP/wudayn-preview/screens"
while ! container=$(xcrun simctl get_app_container "$SIMULATOR_UDID" com.blindmatch.marriage data 2>/dev/null); do
  sleep 1
done
for screen in discovery settings; do
  while [ "$(cat "$container/Documents/display-preview-request" 2>/dev/null || true)" != "$screen" ]; do
    sleep 0.2
  done
  xcrun simctl io "$SIMULATOR_UDID" screenshot "$out/$screen.png"
  printf '%s' "$screen" > "$container/Documents/display-preview-done"
done
