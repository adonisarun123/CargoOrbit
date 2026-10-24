#!/usr/bin/env bash
set -euo pipefail
mobile_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-}}"
: "${ANDROID_HOME:?Set ANDROID_HOME}"
unsigned_apk="${1:-$mobile_dir/android/app/build/outputs/apk/release/app-release-unsigned.apk}"
test_package='com.cargoorbit.driver.test'
build_tools="$ANDROID_HOME/build-tools/37.0.0"
adb_bin="$ANDROID_HOME/platform-tools/adb"
out="$mobile_dir/native-test-results"
mkdir -p "$out"
test_tmp="$(mktemp -d)"
test_started=false
recovered_launcher_anr=0
cleanup(){
 local status=$?
 if [[ "$status" -ne 0 && "$test_started" == true ]]; then
  "$adb_bin" logcat -d > "$out/logcat.txt" 2>/dev/null || true
  "$adb_bin" shell dumpsys activity activities > "$out/activities.txt" 2>/dev/null || true
 fi
 rm -rf "$test_tmp"
 exit "$status"
}
trap cleanup EXIT
# An ephemeral identity signs only the isolated diagnostic package. Never use it for driver releases.
"$build_tools/aapt" dump badging "$unsigned_apk" > "$out/apk-badging.txt"
if ! grep -Fq "package: name='$test_package'" "$out/apk-badging.txt"; then echo 'Refusing to install/clear data for a non-diagnostic package.' >&2; exit 1; fi
keytool -genkeypair -keystore "$test_tmp/test.keystore" -storepass diagnostic-only -keypass diagnostic-only -alias diagnostic -dname 'CN=CargoOrbit ephemeral native test' -keyalg RSA -keysize 2048 -validity 2 -noprompt >/dev/null 2>&1
"$build_tools/zipalign" -p -f 4 "$unsigned_apk" "$test_tmp/aligned.apk"
"$build_tools/apksigner" sign --ks "$test_tmp/test.keystore" --ks-key-alias diagnostic --ks-pass pass:diagnostic-only --key-pass pass:diagnostic-only --out "$test_tmp/diagnostics.apk" "$test_tmp/aligned.apk"
"$adb_bin" wait-for-device
if [[ "$("$adb_bin" shell getprop ro.kernel.qemu | tr -d '\r')" != '1' ]]; then echo 'This harness requires an isolated Android emulator.' >&2; exit 1; fi
"$adb_bin" uninstall "$test_package" >/dev/null 2>&1 || true
"$adb_bin" install "$test_tmp/diagnostics.apk"
"$adb_bin" shell pm clear "$test_package" >/dev/null
"$adb_bin" logcat -c
test_started=true
wait_marker(){
 local expected="$1"
 for attempt in $(seq 1 60); do
  "$adb_bin" shell uiautomator dump /sdcard/cargoorbit-native-window.xml >/dev/null 2>&1 || true
  "$adb_bin" shell cat /sdcard/cargoorbit-native-window.xml > "$out/window.xml" 2>/dev/null || true
  if grep -Fq 'NATIVE_CHECK_FAILED' "$out/window.xml"; then cat "$out/window.xml"; return 1; fi
  if grep -Fq "$expected" "$out/window.xml"; then cp "$out/window.xml" "$out/$expected.xml"; return 0; fi
  # A cold API36 emulator can leave its launcher ANR dialog above the app.
  # Preserve the evidence and recover that exact system process once. Never
  # dismiss an app failure/ANR, clear app data, or treat recovery as a pass.
  if grep -Fq "text=\"Quickstep isn't responding\"" "$out/window.xml"; then
   if [[ "$recovered_launcher_anr" -ne 0 ]]; then echo 'Launcher ANR repeated; emulator is not healthy.' >&2; return 1; fi
   cp "$out/window.xml" "$out/launcher-anr.xml"
   "$adb_bin" logcat -d > "$out/launcher-anr-logcat.txt"
   recovered_launcher_anr=1
   "$adb_bin" shell am force-stop com.android.launcher3
   "$adb_bin" shell am start -W -n "$test_package/.MainActivity"
   continue
  fi
  sleep 2
 done
 "$adb_bin" logcat -d > "$out/logcat.txt"
 echo "Timed out waiting for $expected; see $out" >&2
 return 1
}
"$adb_bin" shell am start -n "$test_package/.MainActivity"
wait_marker NATIVE_CHECK_PHASE1_PASS
"$adb_bin" shell am force-stop "$test_package"
"$adb_bin" shell am start -n "$test_package/.MainActivity"
wait_marker NATIVE_CHECK_PHASE2_PASS
"$adb_bin" logcat -d > "$out/logcat.txt"
echo "Native encryption and force-stop recovery checks passed. Evidence: $out"
