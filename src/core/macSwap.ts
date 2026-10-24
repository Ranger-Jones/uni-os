/**
 * Shell script that installs a downloaded macOS app bundle over the running one:
 *   bash swap.sh <pid of running app> <new .app> <installed .app> <log file>
 * It waits for the app to quit, moves the old bundle aside, copies the new one in, and restores
 * the old bundle if anything fails. Then it relaunches whatever is installed.
 */
export function macSwapScript(): string {
  return `#!/bin/bash
PID="$1"; NEW="$2"; TARGET="$3"; LOG="$4"
exec >>"$LOG" 2>&1
echo "[$(date)] update: $NEW -> $TARGET"
for i in $(seq 1 300); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
relaunch() { [ -n "$UNIOS_SWAP_NO_RELAUNCH" ] || open "$TARGET"; }
if [ ! -x "$NEW/Contents/MacOS/UniOS" ] && [ ! -f "$NEW/Contents/MacOS/UniOS" ]; then
  echo "new app is incomplete, keeping the installed version"; relaunch; exit 1
fi
BACKUP="$TARGET.update-backup"
rm -rf "$BACKUP"
if ! mv "$TARGET" "$BACKUP"; then echo "cannot move the installed app"; relaunch; exit 1; fi
if ditto "$NEW" "$TARGET"; then
  rm -rf "$BACKUP" "$NEW"
  xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
  echo "update installed"; relaunch; exit 0
fi
echo "copy failed, restoring the previous version"
rm -rf "$TARGET"; mv "$BACKUP" "$TARGET"; relaunch; exit 1
`
}
