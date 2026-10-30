#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -d "/home/rehan/.local/node/bin" ]; then
  export PATH="/home/rehan/.local/node/bin:$PATH"
fi

PKG_NAME="typex"
PKG_VERSION="${1:-1.0.0}"
# Strip leading 'v' if present (e.g. v0.1 -> 0.1)
PKG_VERSION="${PKG_VERSION#v}"
PKG_ARCH="amd64"
DEB_NAME="${PKG_NAME}_${PKG_VERSION}_${PKG_ARCH}.deb"
STAGE_DIR="$ROOT_DIR/build/debian/typex_${PKG_VERSION}_${PKG_ARCH}"

echo "=========================================================="
echo "   📦 Packaging TypeX as Debian Package: $DEB_NAME       "
echo "=========================================================="

# 1. Clean staging directory
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/DEBIAN"
mkdir -p "$STAGE_DIR/usr/bin"
mkdir -p "$STAGE_DIR/usr/lib/typex"
mkdir -p "$STAGE_DIR/usr/share/typex/web"
mkdir -p "$STAGE_DIR/usr/share/typex/data"
mkdir -p "$STAGE_DIR/usr/share/applications"
mkdir -p "$STAGE_DIR/usr/share/icons/hicolor/scalable/apps"

# 2. Build backend binary in Release mode (-O3)
echo "[+] Compiling C++ backend binary in Release mode..."
if [ ! -f "$ROOT_DIR/backend/sqlite3.o" ]; then
  gcc -O3 -pthread -c "$ROOT_DIR/backend/include/sqlite3.c" -o "$ROOT_DIR/backend/sqlite3.o"
fi
g++ -std=c++17 -O3 -pthread "$ROOT_DIR/backend/main.cpp" "$ROOT_DIR/backend/sqlite3.o" -I"$ROOT_DIR/backend/include" -ldl -o "$STAGE_DIR/usr/lib/typex/typex-server"
strip --strip-unneeded "$STAGE_DIR/usr/lib/typex/typex-server"

# 3. Build native desktop shell binary
echo "[+] Compiling C++ native desktop shell..."
g++ -std=c++17 -O3 "$ROOT_DIR/desktop_shell/main.cpp" -o "$STAGE_DIR/usr/lib/typex/typex-app"
strip --strip-unneeded "$STAGE_DIR/usr/lib/typex/typex-app"

# 4. Create /usr/bin/typex launcher wrapper
cat << 'LAUNCHER' > "$STAGE_DIR/usr/bin/typex"
#!/usr/bin/env bash
# TypeX desktop wrapper launcher
exec /usr/lib/typex/typex-app "$@"
LAUNCHER
chmod 755 "$STAGE_DIR/usr/bin/typex"

# Also symlink typex-server so it can be run as headless daemon if desired
ln -s /usr/lib/typex/typex-server "$STAGE_DIR/usr/bin/typex-server"

# 5. Build and install static web assets
echo "[+] Exporting static web frontend assets..."
cd "$ROOT_DIR/frontend"
rm -rf .next
pnpm exec next build
cd "$ROOT_DIR"
cp -r "$ROOT_DIR/frontend/out/"* "$STAGE_DIR/usr/share/typex/web/"

# 6. Install read-only word lists
echo "[+] Installing read-only word list corpus..."
cp "$ROOT_DIR/backend/data/"*.txt "$STAGE_DIR/usr/share/typex/data/"
if [ -f "$ROOT_DIR/backend/data/WORDLISTS.md" ]; then
  cp "$ROOT_DIR/backend/data/WORDLISTS.md" "$STAGE_DIR/usr/share/typex/data/"
fi

# 7. Install icons
echo "[+] Installing icons..."
cp "$ROOT_DIR/assets/icons/typex.svg" "$STAGE_DIR/usr/share/icons/hicolor/scalable/apps/typex.svg"

for sz in 16 32 48 64 128 256 512; do
  dir="$STAGE_DIR/usr/share/icons/hicolor/${sz}x${sz}/apps"
  mkdir -p "$dir"
  if [ -f "$ROOT_DIR/assets/icons/typex_${sz}x${sz}.png" ]; then
    cp "$ROOT_DIR/assets/icons/typex_${sz}x${sz}.png" "$dir/typex.png"
  fi
done

# 8. Create desktop file
cat << 'DESKTOP' > "$STAGE_DIR/usr/share/applications/typex.desktop"
[Desktop Entry]
Name=TypeX
Comment=Minimalist High-Performance Typing Benchmark & Stage Competition Engine
Exec=typex %U
Icon=typex
Terminal=false
Type=Application
Categories=Utility;
StartupWMClass=typex-app
Keywords=typing;wpm;benchmark;competition;
DESKTOP
chmod 644 "$STAGE_DIR/usr/share/applications/typex.desktop"

# 9. Compute Installed-Size (in KB)
INSTALLED_SIZE=$(du -sk "$STAGE_DIR" | cut -f1)

# 10. Generate Debian control file
cat << CONTROL > "$STAGE_DIR/DEBIAN/control"
Package: typex
Version: ${PKG_VERSION}
Section: utils
Priority: optional
Architecture: ${PKG_ARCH}
Installed-Size: ${INSTALLED_SIZE}
Maintainer: TypeX Packaging Team <support@typex.local>
Depends: libc6 (>= 2.34), libstdc++6 (>= 11), libgtk-3-0 (>= 3.24.0) | libgtk-3-0t64, libwebkit2gtk-4.1-0 (>= 2.40.0) | libwebkit2gtk-4.0-37 | gir1.2-webkit2-4.1
Recommends: gjs | python3-gi
Description: Minimalist High-Performance Typing Benchmark & Stage Competition Engine
 TypeX is a high-performance typing engine and live stage competition platform.
 Powered by a native C++17 telemetry engine and Next.js reactive stage UI.
 Includes adaptive typing mastery modes, live multi-contestant tournaments,
 and synchronized stage presentation.
 User data is stored in ~/.local/share/TypeX and is preserved on uninstall.
CONTROL
chmod 644 "$STAGE_DIR/DEBIAN/control"

# 11. Generate postinst and prerm scripts
cat << 'POSTINST' > "$STAGE_DIR/DEBIAN/postinst"
#!/bin/sh
set -e
if [ "$1" = "configure" ]; then
    if which update-desktop-database >/dev/null 2>&1; then
        update-desktop-database -q /usr/share/applications || true
    fi
    if which gtk-update-icon-cache >/dev/null 2>&1; then
        gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
    fi
fi
exit 0
POSTINST
chmod 755 "$STAGE_DIR/DEBIAN/postinst"

cat << 'POSTRM' > "$STAGE_DIR/DEBIAN/postrm"
#!/bin/sh
set -e
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
    if which update-desktop-database >/dev/null 2>&1; then
        update-desktop-database -q /usr/share/applications || true
    fi
    if which gtk-update-icon-cache >/dev/null 2>&1; then
        gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
    fi
    # NOTE: User data in ~/.local/share/TypeX is NEVER touched by packaging scripts.
fi
exit 0
POSTRM
chmod 755 "$STAGE_DIR/DEBIAN/postrm"

# Fix all file permissions
find "$STAGE_DIR" -type d -exec chmod 755 {} +
find "$STAGE_DIR/usr/share" -type f -exec chmod 644 {} +
find "$STAGE_DIR/usr/lib/typex" -type f -exec chmod 755 {} +

# 12. Build .deb package
echo "[+] Building deb package..."
mkdir -p "$ROOT_DIR/dist"
dpkg-deb --build --root-owner-group "$STAGE_DIR" "$ROOT_DIR/dist/$DEB_NAME"

echo "=========================================================="
echo "   [✓] Debian package successfully built:                 "
echo "   $ROOT_DIR/dist/$DEB_NAME ($(ls -lh "$ROOT_DIR/dist/$DEB_NAME" | awk '{print $5}'))"
echo "=========================================================="
