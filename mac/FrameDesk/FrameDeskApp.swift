import AppKit
import FrameDeskFeature
import SwiftUI

@main
struct FrameDeskApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        MenuBarExtra {
            DeskView(model: delegate.model)
        } label: {
            MenuLabel(model: delegate.model)
        }
        .menuBarExtraStyle(.window)
    }
}

/// A menu bar icon can be hidden by a crowded (or notched) menu bar. So the
/// same panel also opens as a normal window: on first launch while setup is
/// needed, and whenever the app is opened again from Spotlight or Finder.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let model = DeskModel()
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        if !model.isConfigured { showWindow() }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        showWindow()
        return false
    }

    private func showWindow() {
        if window == nil {
            let w = NSWindow(
                contentRect: .zero,
                styleMask: [.titled, .closable, .fullSizeContentView],
                backing: .buffered,
                defer: false
            )
            w.title = "Frame Desk"
            w.titlebarAppearsTransparent = true
            w.isMovableByWindowBackground = true
            w.isReleasedWhenClosed = false
            w.backgroundColor = .black
            w.contentView = NSHostingView(rootView: DeskView(model: model).padding(.top, 18))
            w.center()
            window = w
        }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}
