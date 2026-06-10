#!/bin/bash
set -e

#
# build_apk.sh — Build local APK dengan version bump otomatis
#
# Usage:
#   ./build_apk.sh              # Interactive, akan ditanya version name
#   ./build_apk.sh 1.0.3        # Langsung set version 1.0.3
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "app.json" ]; then
    echo "❌ app.json not found di $(pwd)"
    exit 1
fi

# ── Read current version dari app.json via node ──
CURRENT=$(node -e "
const app = require('./app.json');
const ver = app.expo.version || '1.0.0';
const code = (app.expo.android && app.expo.android.versionCode) || 0;
console.log(ver + '|' + code);
")

CURRENT_VERSION=$(echo "$CURRENT" | cut -d'|' -f1)
CURRENT_CODE=$(echo "$CURRENT" | cut -d'|' -f2)
NEW_CODE=$((CURRENT_CODE + 1))

echo "┌────────────────────────────────────────┐"
echo "│  📱 Absensi Eos — APK Builder          │"
echo "├────────────────────────────────────────┤"
echo "│  Current version : $CURRENT_VERSION"
echo "│  Current code    : $CURRENT_CODE"
echo "│  Next code       : $NEW_CODE (auto)"
echo "└────────────────────────────────────────┘"
echo ""

# ── Get new version name ──
if [ -n "$1" ]; then
    NEW_VERSION="$1"
else
    read -p "Enter new version name ($CURRENT_VERSION): " NEW_VERSION
    NEW_VERSION=${NEW_VERSION:-$CURRENT_VERSION}
fi

echo ""
echo "📝 Updating app.json..."
echo "   version     : $CURRENT_VERSION → $NEW_VERSION"
echo "   versionCode : $CURRENT_CODE → $NEW_CODE"

# ── Update app.json via node (safe JSON manipulation) ──
node -e "
const fs = require('fs');
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));

app.expo.version = '$NEW_VERSION';

if (!app.expo.android) app.expo.android = {};
app.expo.android.versionCode = $NEW_CODE;

fs.writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');
console.log('   ✅ app.json updated');
"

echo ""

# ── Build APK ──
OUTPUT_NAME="AbsensiEos-v${NEW_VERSION}-build${NEW_CODE}.apk"

echo "🔨 Building APK locally..."
echo "   Profile : apk"
echo "   Output  : $OUTPUT_NAME"
echo ""

eas build --platform android --profile apk --local --output "$OUTPUT_NAME"

if [ -f "$OUTPUT_NAME" ]; then
    SIZE=$(du -h "$OUTPUT_NAME" | cut -f1)
    FULL_PATH="$(pwd)/$OUTPUT_NAME"

    echo ""
    echo "┌────────────────────────────────────────┐"
    echo "│  ✅ Build Complete!                     │"
    echo "├────────────────────────────────────────┤"
    echo "│  File : $OUTPUT_NAME"
    echo "│  Size : $SIZE"
    echo "│  Path : $FULL_PATH"
    echo "├────────────────────────────────────────┤"
    echo "│  📋 Next steps:                        │"
    echo "│  1. Upload APK ke hosting/GDrive       │"
    echo "│  2. Buka CMS → Master Data → Version   │"
    echo "│  3. Create version:                    │"
    echo "│     Name: $NEW_VERSION"
    echo "│     URL : (paste link download APK)    │"
    echo "└────────────────────────────────────────┘"
else
    echo ""
    echo "❌ Build failed — APK file not found"
    exit 1
fi
