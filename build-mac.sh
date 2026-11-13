#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! xcrun --find swiftc >/dev/null 2>&1; then
  echo "请先安装 Xcode 并在 Xcode 设置中选择 Command Line Tools。" >&2
  exit 1
fi
plutil -lint LTZJ/Info.plist LTZJ/PrivacyInfo.xcprivacy LTZJ.xcodeproj/project.pbxproj
xcodebuild -resolvePackageDependencies -project LTZJ.xcodeproj -scheme LTZJ
if [[ "${1:-check}" == "check" ]]; then
  xcodebuild -project LTZJ.xcodeproj -scheme LTZJ -configuration Debug \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath build/DerivedData \
    CODE_SIGNING_ALLOWED=NO build
  echo 'iOS Simulator build completed. This is a compile check, not a signed IPA.'
elif [[ "${1:-}" == "archive" ]]; then
  : "${TEAM_ID:?请设置 TEAM_ID 为你的 Apple 开发者团队 ID}"
  xcodebuild -project LTZJ.xcodeproj -scheme LTZJ -configuration Release \
    -destination 'generic/platform=iOS' -archivePath build/LTZJ.xcarchive \
    DEVELOPMENT_TEAM="$TEAM_ID" -allowProvisioningUpdates archive
  echo '归档完成：build/LTZJ.xcarchive。请在 Xcode Organizer 中选择相应分发方式导出 IPA。'
else
  echo '用法：bash build-mac.sh check | TEAM_ID=你的团队ID bash build-mac.sh archive' >&2
  exit 1
fi
