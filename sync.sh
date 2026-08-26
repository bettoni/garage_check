#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_FILES=(background.js popup.html popup.js popup.css)

usage() {
  echo "Usage: $0 {create|remove}"
  echo ""
  echo "  create  Link chrome/ files (symlinks), copy firefox/ files"
  echo "  remove  Replace all with copies (ready to commit)"
  exit 1
}

[[ $# -eq 1 ]] || usage

case "$1" in
  create)
    # Chrome supports symlinks
    for f in "${SHARED_FILES[@]}"; do
      rm -f "$DIR/chrome/$f"
      ln -s "../$f" "$DIR/chrome/$f"
    done
    rm -f "$DIR/chrome/icons"
    ln -s "../icons" "$DIR/chrome/icons"

    # Firefox does not resolve symlinks — use copies
    for f in "${SHARED_FILES[@]}"; do
      rm -f "$DIR/firefox/$f"
      cp "$DIR/$f" "$DIR/firefox/$f"
    done
    rm -rf "$DIR/firefox/icons"
    cp -r "$DIR/icons" "$DIR/firefox/icons"

    echo "Done. chrome/ → symlinks, firefox/ → copies. Edit shared files at root."
    ;;
  remove)
    for browser in chrome firefox; do
      for f in "${SHARED_FILES[@]}"; do
        if [[ -L "$DIR/$browser/$f" ]]; then
          rm -f "$DIR/$browser/$f"
          cp "$DIR/$f" "$DIR/$browser/$f"
        fi
      done
      if [[ -L "$DIR/$browser/icons" ]]; then
        rm -f "$DIR/$browser/icons"
        cp -r "$DIR/icons" "$DIR/$browser/icons"
      fi
    done
    echo "All symlinks replaced with copies."
    ;;
  *)
    usage
    ;;
esac
