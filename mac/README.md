# Frame Desk

The macOS menu bar app for Frame Dashboard: today's focus, to-dos, meetings
and the week, plus calendar sync to the TV. See the main [README](../README.md#frame-desk-mac-menu-bar-app).

- `FrameDesk/` — the app shell (a `MenuBarExtra`, no Dock icon).
- `FrameDeskPackage/Sources/FrameDeskFeature/` — everything else: API client,
  Keychain, EventKit sync, the popover UI (`DeskView.swift`, `Theme.swift`).
- `Config/` — build settings, Info.plist keys, entitlements (sandbox, network,
  calendars).

```bash
swift test --package-path FrameDeskPackage                 # unit tests
SNAPSHOT_DIR=/tmp swift test --package-path FrameDeskPackage # also renders /tmp/desk.png
```
