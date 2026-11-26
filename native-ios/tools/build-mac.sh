#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
test -f build-input/data/main.js || { echo 'Prepare resources on Windows first, then copy native-ios to this Mac.' >&2; exit 1; }
command -v cmake >/dev/null || { echo 'Install CMake 3.x and Xcode first.' >&2; exit 1; }
xcrun --find clang >/dev/null
cp config/cfg.cmake build-input/proj/cfg.cmake
mkdir -p vendor
if [[ ! -d vendor/cocos-engine/.git ]]; then
  git clone --depth 1 --branch v3.8.8 https://github.com/cocos/cocos-engine.git vendor/cocos-engine
fi
if [[ ! -d vendor/cocos-engine/native/external/.git ]]; then
  git clone --filter=blob:none --sparse --depth 1 --branch v3.8.8-2 https://github.com/cocos/cocos-engine-external.git vendor/cocos-engine/native/external
  git -C vendor/cocos-engine/native/external sparse-checkout set ios sources cmake mac/bin
fi
cmake -S project/ios -B build/xcode -G Xcode \
  -DNODE_EXECUTABLE="$(command -v node)" -DAPP_NAME=LTZJNative -DRES_DIR="$ROOT/build-input" \
  -DCOCOS_X_PATH="$ROOT/vendor/cocos-engine/native" \
  -DCMAKE_OSX_SYSROOT=iphoneos -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_XCODE_ATTRIBUTE_CODE_SIGNING_ALLOWED=NO \
  -DCMAKE_XCODE_ATTRIBUTE_CODE_SIGNING_REQUIRED=NO
cmake --build build/xcode --config Release --parallel 3
APP="$(find build/xcode -type d -name '*.app' -path '*Release*' -print -quit)"
test -n "$APP"
mkdir -p dist/Payload
ditto "$APP" "dist/Payload/LTZJNative.app"
test -n "$(find dist/Payload/LTZJNative.app -name main.js -print -quit)"
cd dist
ditto -c -k --keepParent Payload LTZJNative-unsigned.ipa
shasum -a 256 LTZJNative-unsigned.ipa > LTZJNative-unsigned.sha256
echo 'Built unsigned native IPA; signing and device testing are still required.'
