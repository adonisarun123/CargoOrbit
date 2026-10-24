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
# The config plugin selects compileSdk=37 plus compileSdkMinor=0 in every
# Android module. Require the actual platform; never alias or rewrite SDK data.
if [[ ! -f "$ANDROID_HOME/platforms/android-37.0/android.jar" ]] || ! grep -Eq '^AndroidVersion.ApiLevel[[:space:]]*=[[:space:]]*37\.0[[:space:]]*$' "$ANDROID_HOME/platforms/android-37.0/source.properties"; then
  echo 'Install the official platforms;android-37.0 SDK before building.' >&2
  exit 1
fi
cat "$ANDROID_HOME/platforms/android-37.0/source.properties"
cd "$repo_dir"
node apps/mobile/security/forge-mitigation.cjs --verify
node apps/mobile/security/verify-forge.cjs
cd "$mobile_dir"
"$repo_dir/node_modules/.bin/expo" prebuild --platform android --no-install --skip-dependency-update react,react-native
cd android
./gradlew --no-daemon --stacktrace "app:$task"
echo "Build outputs: $mobile_dir/android/app/build/outputs (unsigned unless user-owned release signing was configured)."
