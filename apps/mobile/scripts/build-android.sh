#!/usr/bin/env bash
set -euo pipefail
mobile_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd "$mobile_dir/../.." && pwd)"
task="${1:-assembleRelease}"
case "$task" in assembleRelease|bundleRelease) ;; *) echo 'Use assembleRelease or bundleRelease' >&2; exit 1;; esac
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-}}"
: "${ANDROID_HOME:?Install Android SDK and set ANDROID_HOME}"
: "${EXPO_PUBLIC_API_URL:?Set the HTTPS API URL before building}"
export ANDROID_HOME
export EAS_BUILD_PROFILE="${EAS_BUILD_PROFILE:-preview}"
case "$EAS_BUILD_PROFILE" in preview|production|diagnostics) ;; *) echo 'Release builds require the preview, production or isolated diagnostics profile.' >&2; exit 1;; esac
export CI=1 EXPO_NO_TELEMETRY=1
# Google publishes API 37 as android-37.0; the pinned Expo/RN templates resolve
# the integer compileSdk 37 as android-37 in all native modules. Keep an alias
# to the verified same API, never a lower platform or a modified SDK payload.
# Upstream runner discussion: https://github.com/actions/runner-images/issues/13859
if [[ ! -e "$ANDROID_HOME/platforms/android-37" && -d "$ANDROID_HOME/platforms/android-37.0" ]]; then
  if [[ ! -f "$ANDROID_HOME/platforms/android-37.0/android.jar" ]] || ! grep -Eq '^AndroidVersion.ApiLevel[[:space:]]*=[[:space:]]*37[[:space:]]*$' "$ANDROID_HOME/platforms/android-37.0/source.properties"; then
    echo 'API 37.0 installation is incomplete or does not declare API 37; refusing SDK alias.' >&2
    exit 1
  fi
  ln -s android-37.0 "$ANDROID_HOME/platforms/android-37"
fi
cd "$repo_dir"
node apps/mobile/security/forge-mitigation.cjs --verify
node apps/mobile/security/verify-forge.cjs
cd "$mobile_dir"
"$repo_dir/node_modules/.bin/expo" prebuild --platform android --no-install --skip-dependency-update react,react-native
cd android
./gradlew --no-daemon --stacktrace "app:$task"
echo "Build outputs: $mobile_dir/android/app/build/outputs (unsigned unless user-owned release signing was configured)."
