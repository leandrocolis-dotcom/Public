#!/bin/zsh
# Instala (ou atualiza) o processo local do botão "Atualizar BTG". A chave fica só no Chaves do macOS;
# o script imprime apenas o hash, que vai para pendulo_btg_worker.key_hash. Ver docs/BTG-PONTE.md.
set -eu
DIR="$HOME/.pendulo/btg-worker"
LABEL="com.pendulo.btg-worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SRC="${0:A:h}"
NODE="$(command -v node)"

mkdir -p "$DIR" "$HOME/Library/LaunchAgents"
chmod 700 "$DIR"
cp "$SRC/btg-worker.mjs" "$SRC/btg-snapshot.mjs" "$DIR/"

if ! /usr/bin/security find-generic-password -a pendulo -s pendulo-btg-worker >/dev/null 2>&1; then
  /usr/bin/security add-generic-password -a pendulo -s pendulo-btg-worker -w "$(openssl rand -hex 32)"
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/btg-worker.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>StartInterval</key><integer>15</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardErrorPath</key><string>$DIR/worker.log</string>
  <key>StandardOutPath</key><string>$DIR/worker.log</string>
</dict></plist>
EOF

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
echo "HASH=$(/usr/bin/security find-generic-password -a pendulo -s pendulo-btg-worker -w | tr -d '\n' | shasum -a 256 | cut -d' ' -f1)"
echo FIM_INSTALL
