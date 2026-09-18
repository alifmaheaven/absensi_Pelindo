#!/bin/bash
set -e

#
# build_apk.sh — Build app (Android atau iOS, local atau cloud via EAS)
#
# Usage:
#   ./build_apk.sh                          # Menu interaktif
#   ./build_apk.sh 1.0.3                    # Android local build, version 1.0.3
#   ./build_apk.sh --cloud                  # Android cloud build via EAS
#   ./build_apk.sh --cloud 1.0.3            # Android cloud build, version 1.0.3
#   ./build_apk.sh --android --local 1.0.3  # Android local build (eksplisit)
#   ./build_apk.sh --ios --cloud            # iOS cloud build (TestFlight)
#   ./build_apk.sh --ios --cloud --submit   # iOS cloud build + upload TestFlight
#
# Catatan:
#   - Tanpa --android/--ios, platform ditanya secara interaktif.
#   - Tanpa --local/--cloud, mode ditanya secara interaktif.
#   - iOS hanya mendukung CLOUD build (butuh macOS + Xcode untuk local).
#   - Android versionCode di-increment lokal.
#   - iOS buildNumber dikelola REMOTE oleh EAS (appVersionSource: remote).
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "app.json" ]; then
    echo "❌ app.json not found di $(pwd)"
    exit 1
fi

# ── Parse arguments ──
BUILD_PLATFORM=""
BUILD_MODE=""
VERSION_ARG=""
DO_SUBMIT=0

for arg in "$@"; do
    case "$arg" in
        --android|-a)
            BUILD_PLATFORM="android"
            ;;
        --ios|-i)
            BUILD_PLATFORM="ios"
            ;;
        --cloud|-c)
            BUILD_MODE="cloud"
            ;;
        --local|-l)
            BUILD_MODE="local"
            ;;
        --submit|-s)
            DO_SUBMIT=1
            ;;
        *)
            VERSION_ARG="$arg"
            ;;
    esac
done

# ── Backward compatibility ──
# Pemakaian lama: `./build_apk.sh 1.0.3` atau `./build_apk.sh --cloud 1.0.3`
# selalu berarti ANDROID. Agar tidak rusak, kalau ada indikasi argumen (versi
# atau flag mode) tapi platform belum ditentukan, default-kan ke android
# alih-alih memunculkan menu (yang akan menelan argumen versi sebagai jawaban).
if [ -z "$BUILD_PLATFORM" ] && { [ -n "$VERSION_ARG" ] || [ -n "$BUILD_MODE" ]; }; then
    BUILD_PLATFORM="android"
fi

# ── Interactive fallback: platform ──
if [ -z "$BUILD_PLATFORM" ]; then
    echo ""
    echo "┌──────────────────────────────────────────────┐"
    echo "│  📱 Pilih platform build                     │"
    echo "├──────────────────────────────────────────────┤"
    echo "│  1) Android                                  │"
    echo "│  2) iOS                                      │"
    echo "└──────────────────────────────────────────────┘"
    read -p "Pilihan [1/2] (default: 1): " _PLAT
    _PLAT=${_PLAT:-1}
    case "$_PLAT" in
        1|android|Android)  BUILD_PLATFORM="android" ;;
        2|ios|iOS)          BUILD_PLATFORM="ios" ;;
        *)
            echo "❌ Pilihan platform tidak valid: $_PLAT"
            exit 1
            ;;
    esac
fi

# ── Backward compatibility: mode ──
# Pemakaian lama `./build_apk.sh [version]` berarti LOCAL build. Kalau versi
# diberikan tanpa flag mode, pertahankan perilaku itu (jangan tanya). Menu mode
# hanya muncul saat script dipanggil tanpa argumen apa pun.
if [ -z "$BUILD_MODE" ] && [ -n "$VERSION_ARG" ]; then
    BUILD_MODE="local"
fi

# ── Interactive fallback: mode ──
if [ -z "$BUILD_MODE" ]; then
    echo ""
    echo "┌──────────────────────────────────────────────┐"
    echo "│  ⚙️  Pilih mode build                        │"
    echo "├──────────────────────────────────────────────┤"
    echo "│  1) Cloud  (via EAS — tidak perlu SDK lokal) │"
    echo "│  2) Local  (butuh SDK terpasang di mesin)    │"
    echo "└──────────────────────────────────────────────┘"
    read -p "Pilihan [1/2] (default: 1): " _MODE
    _MODE=${_MODE:-1}
    case "$_MODE" in
        1|cloud|Cloud|CLOUD)  BUILD_MODE="cloud" ;;
        2|local|Local|LOCAL)  BUILD_MODE="local" ;;
        *)
            echo "❌ Pilihan mode tidak valid: $_MODE"
            exit 1
            ;;
    esac
fi

# ── Guard: iOS tidak mendukung local build ──
if [ "$BUILD_PLATFORM" = "ios" ] && [ "$BUILD_MODE" = "local" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════╗"
    echo "║  ❌ iOS tidak mendukung LOCAL build          ║"
    echo "╠══════════════════════════════════════════════╣"
    echo "║  iOS local build butuh macOS + Xcode dan     ║"
    echo "║  signing certificate yang terpasang lokal.   ║"
    echo "║                                              ║"
    echo "║  Gunakan cloud build:                        ║"
    echo "║    ./build_apk.sh --ios --cloud              ║"
    echo "╚══════════════════════════════════════════════╝"
    exit 1
fi

# ── Header ──
echo ""
echo "┌──────────────────────────────────────────────┐"
if [ "$BUILD_MODE" = "cloud" ]; then
    echo "│  ☁️  Mode    : CLOUD BUILD (via EAS)          │"
else
    echo "│  🖥️  Mode    : LOCAL BUILD                    │"
fi
if [ "$BUILD_PLATFORM" = "ios" ]; then
    echo "│  🍏 Platform: iOS                            │"
else
    echo "│  🤖 Platform: Android                        │"
fi
echo "└──────────────────────────────────────────────┘"
echo ""

# ╔══════════════════════════════════════════════════════════════╗
# ║  PRE-FLIGHT CHECKS                                           ║
# ╚══════════════════════════════════════════════════════════════╝

ERRORS=0

echo "🔍 Pre-flight Checks"
echo ""

# ── Helper: install guide ──
print_install_guide() {
    local NAME="$1" URL="$2" MAC_CMD="$3" WIN_CMD="$4" NOTE="$5"
    echo "  ╔══════════════════════════════════════════════╗"
    echo "  ║  📦 Install $NAME"
    echo "  ╠══════════════════════════════════════════════╣"
    echo "  ║  Download: $URL"
    [ -n "$MAC_CMD" ] && echo "  ║  macOS:    $MAC_CMD"
    [ -n "$WIN_CMD" ] && echo "  ║  Windows:  $WIN_CMD"
    [ -n "$NOTE" ]    && echo "  ║  Note:     $NOTE"
    echo "  ╚══════════════════════════════════════════════╝"
}

# ── 1. Node.js (wajib semua mode) ──
if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo "  ✅ Node.js $NODE_VER (>= 18 required)"
    else
        echo "  ❌ Node.js $NODE_VER — butuh >= 18"
        print_install_guide "Node.js" "https://nodejs.org" \
            "brew install node" "Download LTS dari website" "Pilih 'Automatically install tools'"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "  ❌ Node.js tidak ditemukan"
    print_install_guide "Node.js" "https://nodejs.org" \
        "brew install node" "Download LTS dari website" "Pilih 'Automatically install tools'"
    ERRORS=$((ERRORS + 1))
fi

# ── 2. npm (wajib semua mode) ──
if command -v npm &> /dev/null; then
    echo "  ✅ npm $(npm -v)"
else
    echo "  ❌ npm tidak ditemukan"
    ERRORS=$((ERRORS + 1))
fi

# ── 3. EAS CLI / Expo login (wajib semua mode) ──
if command -v eas &> /dev/null; then
    echo "  ✅ EAS CLI (global): $(eas --version 2>/dev/null || echo 'unknown')"
else
    echo "  ℹ️  EAS CLI global tidak ada — akan pakai npx eas-cli@20.2.0"
fi

# Cek Expo login (wajib cloud mode)
if [ "$BUILD_MODE" = "cloud" ]; then
    if command -v eas &> /dev/null; then
        if eas whoami &> /dev/null; then
            EAS_USER=$(eas whoami 2>/dev/null)
            echo "  ✅ Expo login: $EAS_USER"
        else
            echo "  ❌ Belum login ke Expo"
            echo "  ╔══════════════════════════════════════════════╗"
            echo "  ║  📦 Login ke Expo                           ║"
            echo "  ╠══════════════════════════════════════════════╣"
            echo "  ║  1. Daftar: https://expo.dev (gratis)       ║"
            echo "  ║  2. Jalankan: eas login                      ║"
            echo "  ║  3. Masukkan email & password Expo          ║"
            echo "  ╚══════════════════════════════════════════════╝"
            ERRORS=$((ERRORS + 1))
        fi
    else
        # Cek via npx
        if npx eas-cli@20.2.0 whoami &> /dev/null 2>&1; then
            EAS_USER=$(npx eas-cli@20.2.0 whoami 2>/dev/null)
            echo "  ✅ Expo login: $EAS_USER"
        else
            echo "  ❌ Belum login ke Expo"
            echo "  ╔══════════════════════════════════════════════╗"
            echo "  ║  📦 Login ke Expo                           ║"
            echo "  ╠══════════════════════════════════════════════╣"
            echo "  ║  1. Daftar: https://expo.dev (gratis)       ║"
            echo "  ║  2. Jalankan: npx eas-cli@20.2.0 login      ║"
            echo "  ║  3. Masukkan email & password Expo          ║"
            echo "  ╚══════════════════════════════════════════════╝"
            ERRORS=$((ERRORS + 1))
        fi
    fi
fi

# ── 4. Java & Android SDK (ANDROID LOCAL BUILD SAJA) ──
if [ "$BUILD_PLATFORM" = "android" ] && [ "$BUILD_MODE" = "local" ]; then

    # Java
    if command -v java &> /dev/null; then
        JAVA_VER=$(java -version 2>&1 | head -1 | awk -F '"' '{print $2}')
        JAVA_MAJOR=$(echo "$JAVA_VER" | cut -d. -f1)
        if [ "$JAVA_MAJOR" -ge 17 ]; then
            echo "  ✅ Java $JAVA_VER (>= 17 required)"
        else
            echo "  ❌ Java $JAVA_VER — butuh >= 17"
            print_install_guide "Java JDK 17" "https://adoptium.net/temurin/releases/?version=17" \
                "brew install --cask temurin@17" "Download Windows x64 MSI" "Set JAVA_HOME"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo "  ❌ Java tidak ditemukan"
        print_install_guide "Java JDK 17" "https://adoptium.net/temurin/releases/?version=17" \
            "brew install --cask temurin@17" "Download Windows x64 MSI" "Set JAVA_HOME"
        ERRORS=$((ERRORS + 1))
    fi

    # Android SDK
    SDK_DIR=""
    if [ -n "$ANDROID_HOME" ]; then
        SDK_DIR="$ANDROID_HOME"
    elif [ -n "$ANDROID_SDK_ROOT" ]; then
        SDK_DIR="$ANDROID_SDK_ROOT"
    elif [ -d "$HOME/Library/Android/sdk" ]; then
        SDK_DIR="$HOME/Library/Android/sdk"
    elif [ -d "$LOCALAPPDATA/Android/Sdk" ]; then
        SDK_DIR="$LOCALAPPDATA/Android/Sdk"
    fi

    if [ -n "$SDK_DIR" ] && [ -d "$SDK_DIR" ]; then
        echo "  ✅ Android SDK: $SDK_DIR"

        # Platform
        if [ -d "$SDK_DIR/platforms/android-35" ] || [ -d "$SDK_DIR/platforms/android-36" ]; then
            echo "  ✅ Android Platform (35/36)"
        else
            echo "  ❌ Android Platform tidak ditemukan"
            ERRORS=$((ERRORS + 1))
        fi

        # Build tools
        if ls -d "$SDK_DIR/build-tools/"* &> /dev/null; then
            echo "  ✅ Build Tools: $(ls "$SDK_DIR/build-tools/" | tail -1)"
        else
            echo "  ❌ Build Tools tidak ditemukan"
            ERRORS=$((ERRORS + 1))
        fi

        # Platform tools
        if [ -d "$SDK_DIR/platform-tools" ]; then
            echo "  ✅ Platform Tools"
        else
            echo "  ❌ Platform Tools tidak ditemukan"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo "  ❌ Android SDK tidak ditemukan"
        echo "  ╔══════════════════════════════════════════════╗"
        echo "  ║  📦 Install Android Studio (termasuk SDK)   ║"
        echo "  ╠══════════════════════════════════════════════╣"
        echo "  ║  Download: https://developer.android.com/studio"
        echo "  ║  macOS:   Download .dmg → drag ke Applications"
        echo "  ║  Windows: Download .exe → jalankan installer"
        echo "  ║  Setelah install, jalankan Setup Wizard (Standard)"
        echo "  ║  Set ANDROID_HOME:"
        echo "  ║  macOS:  export ANDROID_HOME=\$HOME/Library/Android/sdk"
        echo "  ║  Windows: setx ANDROID_HOME '%LOCALAPPDATA%\Android\Sdk'"
        echo "  ╚══════════════════════════════════════════════╝"
        ERRORS=$((ERRORS + 1))
    fi
elif [ "$BUILD_MODE" = "cloud" ]; then
    # Cloud mode — skip Java & SDK checks
    echo "  ⏭️  Java & Android SDK tidak diperlukan (cloud build)"
elif [ "$BUILD_PLATFORM" = "ios" ]; then
    # iOS local tidak mungkin (sudah dijaga di atas), ini jaga-jaga
    echo "  ⏭️  Java & Android SDK tidak diperlukan (iOS build)"
fi

# ── 5. node_modules ──
if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
    echo "  ✅ node_modules sudah terinstall"
else
    echo "  ⚠️  node_modules belum ada — akan jalankan npm install"
fi

# ── 6. android directory (Android local saja) ──
if [ "$BUILD_PLATFORM" = "android" ] && [ "$BUILD_MODE" = "local" ]; then
    if [ -f "android/app/build.gradle" ]; then
        echo "  ✅ Android native project sudah di-generate"
    else
        echo "  ⚠️  Android native project belum ada — akan jalankan expo prebuild"
    fi
fi

# ── 7. iOS credentials (iOS cloud saja) ──
if [ "$BUILD_PLATFORM" = "ios" ]; then
    APPLE_KEY_DIR="$HOME/.appstoreconnect/private_keys"
    if ls "$APPLE_KEY_DIR"/AuthKey_*.p8 &> /dev/null; then
        APPLE_KEY=$(ls "$APPLE_KEY_DIR"/AuthKey_*.p8 | head -1 | xargs basename)
        echo "  ✅ Apple API Key tersedia: $APPLE_KEY"
    else
        echo "  ℹ️  Apple API Key lokal tidak ditemukan di $APPLE_KEY_DIR"
        echo "      (tidak wajib — EAS menyimpan credentials di server)"
    fi

    if [ "$DO_SUBMIT" = "1" ]; then
        echo "  ℹ️  Mode SUBMIT aktif — hasil build akan diupload ke TestFlight"
    fi
fi

echo ""

# ── Summary ──
if [ "$ERRORS" -gt 0 ]; then
    echo "╔══════════════════════════════════════════════╗"
    echo "║  ❌ $ERRORS error. Fix dulu sebelum build.          ║"
    echo "╠══════════════════════════════════════════════╣"
    echo "║  Setelah fix, jalankan ulang:                ║"
    if [ "$BUILD_PLATFORM" = "ios" ]; then
        echo "║  ./build_apk.sh --ios --cloud [version]      ║"
    elif [ "$BUILD_MODE" = "cloud" ]; then
        echo "║  ./build_apk.sh --cloud [version]            ║"
    else
        echo "║  ./build_apk.sh [version]                    ║"
    fi
    echo "╚══════════════════════════════════════════════╝"
    exit 1
fi

echo "╔══════════════════════════════════════════════╗"
echo "║  ✅ Semua pre-flight checks passed!           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ╔══════════════════════════════════════════════════════════════╗
# ║  BUILD PROCESS                                               ║
# ╚══════════════════════════════════════════════════════════════╝

# ── Read current version dari app.json via node ──
CURRENT=$(node -e "
const app = require('./app.json');
const ver = app.expo.version || '1.0.0';
const code = (app.expo.android && app.expo.android.versionCode) || 0;
console.log(ver + '|' + code);
")

CURRENT_VERSION=$(echo "$CURRENT" | cut -d'|' -f1)
CURRENT_CODE=$(echo "$CURRENT" | cut -d'|' -f2)

echo "┌──────────────────────────────────────────────┐"
if [ "$BUILD_PLATFORM" = "ios" ]; then
    echo "│  🍏 Absensi Eos — iOS Cloud Builder (EAS)    │"
elif [ "$BUILD_MODE" = "cloud" ]; then
    echo "│  📱 Absensi Eos — Cloud Builder (EAS)        │"
else
    echo "│  📱 Absensi Eos — APK Builder                │"
fi
echo "├──────────────────────────────────────────────┤"
echo "│  Current version : $CURRENT_VERSION"
echo "│  Current code    : $CURRENT_CODE"
if [ "$BUILD_PLATFORM" = "android" ]; then
    echo "│  Next code       : $((CURRENT_CODE + 1)) (auto)"
else
    echo "│  Next build num  : dikelola remote oleh EAS"
fi
echo "└──────────────────────────────────────────────┘"
echo ""

# ── Get new version name ──
if [ -n "$VERSION_ARG" ]; then
    NEW_VERSION="$VERSION_ARG"
else
    read -p "Enter new version name ($CURRENT_VERSION): " NEW_VERSION
    NEW_VERSION=${NEW_VERSION:-$CURRENT_VERSION}
fi

echo ""

# ── Update app.json ──
# Android  : version + versionCode di-increment lokal
# iOS      : hanya version; buildNumber dikelola REMOTE oleh EAS (appVersionSource: remote)
#
# Backup dulu: kalau build GAGAL, app.json dikembalikan ke kondisi semula supaya
# versionCode tidak "terbakar" percuma dan tidak meninggalkan working tree kotor.
APPJSON_BAK="$(mktemp -t appjson_bak.XXXXXX)"
cp app.json "$APPJSON_BAK"

restore_appjson_on_fail() {
    local _exit_code=$?
    trap - EXIT
    if [ "$_exit_code" -ne 0 ] && [ -n "$APPJSON_BAK" ] && [ -f "$APPJSON_BAK" ]; then
        echo ""
        echo "⚠️  Build gagal (exit $_exit_code) — mengembalikan app.json ke kondisi semula."
        cp "$APPJSON_BAK" app.json 2>/dev/null || true
    fi
    [ -n "$APPJSON_BAK" ] && rm -f "$APPJSON_BAK"
    exit "$_exit_code"
}
trap restore_appjson_on_fail EXIT

if [ "$BUILD_PLATFORM" = "android" ]; then
    NEW_CODE=$((CURRENT_CODE + 1))
    echo "📝 Updating app.json..."
    echo "   version     : $CURRENT_VERSION → $NEW_VERSION"
    echo "   versionCode : $CURRENT_CODE → $NEW_CODE"

    node -e "
    const fs = require('fs');
    const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
    app.expo.version = '$NEW_VERSION';
    if (!app.expo.android) app.expo.android = {};
    app.expo.android.versionCode = $NEW_CODE;
    fs.writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');
    console.log('   ✅ app.json updated');
    "
else
    echo "📝 Updating app.json..."
    echo "   version     : $CURRENT_VERSION → $NEW_VERSION"
    echo "   buildNumber : (remote — EAS auto-increment)"

    node -e "
    const fs = require('fs');
    const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
    app.expo.version = '$NEW_VERSION';
    fs.writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');
    console.log('   ✅ app.json updated');
    "
fi

# ╔══════════════════════════════════════════════════════════════╗
# ║  ANDROID LOCAL BUILD                                         ║
# ╚══════════════════════════════════════════════════════════════╝
if [ "$BUILD_PLATFORM" = "android" ] && [ "$BUILD_MODE" = "local" ]; then

    # Ensure local.properties
    if [ ! -f "android/local.properties" ]; then
        echo "📝 Creating android/local.properties..."
        _SDK=""
        if [ -n "$ANDROID_HOME" ]; then _SDK="$ANDROID_HOME"
        elif [ -n "$ANDROID_SDK_ROOT" ]; then _SDK="$ANDROID_SDK_ROOT"
        elif [ -d "$HOME/Library/Android/sdk" ]; then _SDK="$HOME/Library/Android/sdk"
        elif [ -d "$LOCALAPPDATA/Android/Sdk" ]; then _SDK="$LOCALAPPDATA/Android/Sdk"
        elif [ -d "$HOME/AppData/Local/Android/Sdk" ]; then _SDK="$HOME/AppData/Local/Android/Sdk"
        fi
        if [ -n "$_SDK" ]; then
            if [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "cygwin"* ]]; then
                _SDK=$(cygpath -w "$_SDK" 2>/dev/null || echo "$_SDK")
            fi
            echo "sdk.dir=$_SDK" > android/local.properties
            echo "   ✅ local.properties created"
        fi
    fi

    # Set ANDROID_SDK_ROOT
    if [ -z "$ANDROID_SDK_ROOT" ]; then
        if [ -d "$HOME/Library/Android/sdk" ]; then export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
        elif [ -d "$LOCALAPPDATA/Android/Sdk" ]; then export ANDROID_SDK_ROOT="$LOCALAPPDATA/Android/Sdk"
        fi
    fi

    OUTPUT_NAME="AbsensiEos-v${NEW_VERSION}-build${NEW_CODE}.apk"
    echo ""
    echo "🔨 Building APK locally..."
    echo "   Output  : $OUTPUT_NAME"
    echo ""

    EXPO_ROUTER_DISABLE_RN_NAVIGATION_CHECK=1 npx eas-cli@20.2.0 build --platform android --profile apk --local --output "$OUTPUT_NAME"

    if [ -f "$OUTPUT_NAME" ]; then
        SIZE=$(du -h "$OUTPUT_NAME" | cut -f1)
        echo ""
        echo "╔══════════════════════════════════════════════╗"
        echo "║  ✅ Build Complete!                           ║"
        echo "╠══════════════════════════════════════════════╣"
        echo "║  File : $OUTPUT_NAME"
        echo "║  Size : $SIZE"
        echo "║  Path : $(pwd)/$OUTPUT_NAME"
        echo "╠══════════════════════════════════════════════╣"
        echo "║  📋 Upload ke hosting → CMS → Master Data    ║"
        echo "╚══════════════════════════════════════════════╝"
    else
        echo ""
        echo "❌ Build failed — APK file not found"
        exit 1
    fi

# ╔══════════════════════════════════════════════════════════════╗
# ║  ANDROID CLOUD BUILD                                         ║
# ╚══════════════════════════════════════════════════════════════╝
elif [ "$BUILD_PLATFORM" = "android" ]; then

    echo ""
    echo "☁️  Building via EAS Cloud..."
    echo "   Build ini akan berjalan di server Expo."
    echo "   Kamu akan mendapat link download setelah selesai."
    echo ""

    # Set EXPO_TOKEN if available
    if [ -n "$EXPO_TOKEN" ]; then
        echo "   ✅ EXPO_TOKEN detected"
    fi

    echo "   📡 Starting cloud build..."
    echo ""

    EXPO_ROUTER_DISABLE_RN_NAVIGATION_CHECK=1 npx eas-cli@20.2.0 build --platform android --profile apk --non-interactive

    echo ""
    echo "╔══════════════════════════════════════════════╗"
    echo "║  ✅ Cloud Build Submitted!                    ║"
    echo "╠══════════════════════════════════════════════╣"
    echo "║  📋 Next steps:                              ║"
    echo "║  1. Cek status: https://expo.dev             ║"
    echo "║     → Your Projects → Build tab              ║"
    echo "║  2. Setelah selesai, klik Download APK       ║"
    echo "║  3. Upload ke hosting/GDrive                 ║"
    echo "║  4. Buka CMS → Master Data → Version         ║"
    echo "║     Name: $NEW_VERSION"
    echo "║     URL : (paste link download APK)          ║"
    echo "╚══════════════════════════════════════════════╝"

# ╔══════════════════════════════════════════════════════════════╗
# ║  iOS CLOUD BUILD                                             ║
# ╚══════════════════════════════════════════════════════════════╝
else

    echo ""
    echo "🍏 Building iOS via EAS Cloud..."
    echo "   Build ini akan berjalan di server Expo."
    echo "   Signing memakai certificate yang tersimpan di EAS."
    echo ""

    if [ -n "$EXPO_TOKEN" ]; then
        echo "   ✅ EXPO_TOKEN detected"
    fi

    echo "   📡 Starting iOS cloud build..."
    echo ""

    npx eas-cli@latest build --platform ios --profile production --non-interactive

    echo ""
    if [ "$DO_SUBMIT" = "1" ]; then
        echo "╔══════════════════════════════════════════════╗"
        echo "║  📤 Submitting ke TestFlight...               ║"
        echo "╚══════════════════════════════════════════════╝"
        echo ""
        npx eas-cli@latest submit --platform ios --profile production --latest
        echo ""
        echo "╔══════════════════════════════════════════════╗"
        echo "║  ✅ Submitted to TestFlight!                  ║"
        echo "╠══════════════════════════════════════════════╣"
        echo "║  Apple memproses 5-10 menit sebelum build    ║"
        echo "║  bisa dibagikan ke tester.                   ║"
        echo "║                                              ║"
        echo "║  Cek di: App Store Connect → TestFlight      ║"
        echo "╚══════════════════════════════════════════════╝"
    else
        echo "╔══════════════════════════════════════════════╗"
        echo "║  ✅ iOS Cloud Build Submitted!                ║"
        echo "╠══════════════════════════════════════════════╣"
        echo "║  📋 Next steps:                              ║"
        echo "║  1. Cek status: https://expo.dev             ║"
        echo "║     → Your Projects → Build tab              ║"
        echo "║  2. Setelah selesai, upload ke TestFlight:   ║"
        echo "║     ./build_apk.sh --ios --cloud --submit    ║"
        echo "║     atau: npm run submit:ios                 ║"
        echo "╚══════════════════════════════════════════════╝"
    fi

fi
