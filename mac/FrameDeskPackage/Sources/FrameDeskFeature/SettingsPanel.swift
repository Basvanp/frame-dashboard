import AppKit
import ServiceManagement
import SwiftUI

struct SettingsPanel: View {
    @Bindable var model: DeskModel
    let done: () -> Void

    @State private var url = ""
    @State private var key = ""
    @State private var saving = false
    @State private var openAtLogin = SMAppService.mainApp.status == .enabled

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Settings").font(.system(size: 17, weight: .semibold)).foregroundStyle(Theme.ink)
                Spacer()
                if model.isConfigured {
                    RoundButton(symbol: "xmark", action: done)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Kicker(text: "Dashboard")
                field("https://your-dashboard.vercel.app", text: $url)
                SecureField(model.hasKey ? "Key saved — paste a new one to replace" : "Write key (DASHBOARD_WRITE_KEY)", text: $key)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .padding(10)
                    .background(Color.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text("The key is stored in your Keychain.")
                    .font(.system(size: 11)).foregroundStyle(Theme.ink3)
            }
            .tile()

            VStack(alignment: .leading, spacing: 8) {
                Kicker(text: "Calendar")
                Toggle(isOn: $model.calendarSyncOn) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Send this Mac's meetings to the TV").font(.system(size: 13)).foregroundStyle(Theme.ink)
                        Text("Reads every calendar in Calendar.app, skipping birthdays and subscriptions.")
                            .font(.system(size: 11)).foregroundStyle(Theme.ink3)
                    }
                }
                .toggleStyle(.switch)
                .tint(Theme.champagne)
                if let status = model.calendarStatus {
                    Text(status).font(.system(size: 11)).foregroundStyle(.orange)
                }
            }
            .tile()

            Toggle(isOn: $openAtLogin) {
                Text("Open at login").font(.system(size: 13)).foregroundStyle(Theme.ink)
            }
            .toggleStyle(.switch)
            .tint(Theme.champagne)
            .padding(.horizontal, 4)
            .onChange(of: openAtLogin) { _, on in
                do {
                    if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
                } catch {
                    openAtLogin = SMAppService.mainApp.status == .enabled
                    model.error = "Couldn't change login item: \(error.localizedDescription)"
                }
            }

            if let error = model.error {
                Text(error).font(.system(size: 12)).foregroundStyle(.orange)
            }

            HStack {
                Button("Quit Frame Desk") { NSApp.terminate(nil) }
                    .buttonStyle(.plain)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.ink3)
                Spacer()
                Button {
                    saving = true
                    Task {
                        await model.saveSettings(url: url, key: key)
                        key = ""
                        saving = false
                        if model.isConfigured && model.error == nil { done() }
                    }
                } label: {
                    Text(saving ? "Connecting…" : "Save")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color.black)
                        .padding(.horizontal, 18).padding(.vertical, 8)
                        .background(Capsule().fill(Theme.champagne))
                }
                .buttonStyle(.plain)
                .disabled(saving || url.isEmpty || (!model.hasKey && key.isEmpty))
            }
        }
        .onAppear { url = model.baseURL }
    }

    private func field(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text)
            .textFieldStyle(.plain)
            .font(.system(size: 13))
            .padding(10)
            .background(Color.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

/// The menu bar item: a frame glyph plus the next meeting or the to-do count.
public struct MenuLabel: View {
    let model: DeskModel
    public init(model: DeskModel) { self.model = model }

    public var body: some View {
        let title = model.menuTitle
        HStack(spacing: 4) {
            Image(systemName: "photo.artframe")
            if !title.isEmpty { Text(title) }
        }
    }
}
