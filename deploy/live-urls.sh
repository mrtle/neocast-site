#!/bin/sh
set -eu
# Only the image's copied public files change; GitHub Pages source stays untouched.
root="${1:-/srv}"
find "$root" -type f \( -name '*.html' -o -name '*.js' -o -name '*.mjs' -o -name '*.json' -o -name '*.css' -o -name '*.svg' -o -name '*.txt' -o -name '*.xml' -o -name '*.webmanifest' \) -exec sed -i \
  -e 's|https://sesh-production-6061\.up\.railway\.app|https://app.neocast.live|g' \
  -e 's|https://neocast\.us|https://neocast.live|g' {} +
