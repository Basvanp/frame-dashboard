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
                Text("Settings").font(Theme.text(17, .semibold)).foregroundStyle(Theme.ink)
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
                    .font(Theme.text(13))
                    .padding(10)
                    .background(Color.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text("The key is stored in your Keychain.")
                    .font(Theme.text(11)).foregroundStyle(Theme.ink3)
            }
            .tile()

            VStack(alignment: .leading, spacing: 8) {
                Kicker(text: "Calendar")
                Toggle(isOn: $model.calendarSyncOn) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Send this Mac's meetings to the TV").font(Theme.text(13)).foregroundStyle(Theme.ink)
                        Text("Reads every calendar in Calendar.app, skipping birthdays and subscriptions.")
                            .font(Theme.text(11)).foregroundStyle(Theme.ink3)
                    }
                }
                .toggleStyle(.switch)
                .tint(Theme.champagne)
                if let status = model.calendarStatus {
                    Text(status).font(Theme.text(11)).foregroundStyle(.orange)
                }
            }
            .tile()

            if !model.layouts.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Kicker(text: "Screen design")
                    HStack(spacing: 8) {
                        ForEach(model.layouts) { l in
                            LayoutCard(layout: l, selected: model.layout == l.id) {
                                Task { await model.setLayout(l.id) }
                            }
                        }
                    }
                    if let d = model.layouts.first(where: { $0.id == model.layout })?.description {
                        Text(d).font(Theme.text(11)).foregroundStyle(Theme.ink3)
                    }
                }
                .tile()
            }

            if !model.artPacks.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Kicker(text: "Art on the TV")
                    ForEach(model.artPacks) { pack in
                        Toggle(isOn: Binding(
                            get: { model.enabledPacks.contains(pack.id) },
                            set: { on in Task { await model.setPack(pack.id, on: on) } }
                        )) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(pack.name) · \(pack.count)").font(Theme.text(13)).foregroundStyle(Theme.ink)
                                if let d = pack.description {
                                    Text(d).font(Theme.text(11)).foregroundStyle(Theme.ink3).lineLimit(2)
                                }
                            }
                        }
                        .toggleStyle(.switch)
                        .tint(Theme.champagne)
                        .disabled(model.enabledPacks == [pack.id])
                    }
                }
                .tile()
            }

            Toggle(isOn: $openAtLogin) {
                Text("Open at login").font(Theme.text(13)).foregroundStyle(Theme.ink)
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
                Text(error).font(Theme.text(12)).foregroundStyle(.orange)
            }

            HStack {
                Button("Quit Frame Desk") { NSApp.terminate(nil) }
                    .buttonStyle(.plain)
                    .font(Theme.text(12))
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
                        .font(Theme.text(13, .semibold))
                        .foregroundStyle(Color.black)
                        .padding(.horizontal, 18).padding(.vertical, 8)
                        .background(Capsule().fill(Theme.champagne))
                }
                .buttonStyle(.plain)
                .disabled(saving || url.isEmpty || (!model.hasKey && key.isEmpty))
            }
        }
        .onAppear { url = model.baseURL }
        .task { await model.loadArtPacks() }
    }

    private func field(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text)
            .textFieldStyle(.plain)
            .font(Theme.text(13))
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

/// A tiny schematic of each design, so the choice reads at a glance.
struct LayoutCard: View {
    let layout: ScreenLayout
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Schematic(id: layout.id)
                    .frame(height: 52)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .strokeBorder(selected ? Theme.champagne : Theme.stroke, lineWidth: selected ? 1.5 : 1)
                    )
                Text(layout.name)
                    .font(Theme.text(11, selected ? .semibold : .regular))
                    .foregroundStyle(selected ? Theme.ink : Theme.ink2)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct Schematic: View {
    let id: String
    private let painting = LinearGradient(colors: [Color(red: 0.55, green: 0.62, blue: 0.66), Color(red: 0.62, green: 0.56, blue: 0.42)], startPoint: .top, endPoint: .bottom)
    private let wall = Color(red: 0.13, green: 0.17, blue: 0.15)
    private let placard = Color(red: 0.94, green: 0.91, blue: 0.86)

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            switch id {
            case "salon":
                ZStack(alignment: .topLeading) {
                    wall
                    Rectangle().fill(painting).frame(width: w * 0.42, height: h * 0.5)
                        .border(Theme.champagne, width: 2).offset(x: w * 0.1, y: h * 0.22)
                    lines.offset(x: w * 0.6, y: h * 0.28)
                }
            case "painting":
                ZStack(alignment: .topLeading) {
                    painting
                    placardView(w: w, h: h)
                }
            default: // "bleed": painting by day, salon at night
                HStack(spacing: 0) {
                    ZStack(alignment: .topLeading) { painting; placardView(w: w / 2, h: h) }.frame(width: w / 2)
                    ZStack(alignment: .topLeading) {
                        wall
                        Rectangle().fill(painting).frame(width: w * 0.16, height: h * 0.4)
                            .border(Theme.champagne, width: 1.5).offset(x: w * 0.06, y: h * 0.28)
                        lines.scaleEffect(0.7, anchor: .topLeading).offset(x: w * 0.28, y: h * 0.32)
                    }
                    .frame(width: w / 2)
                }
            }
        }
    }

    private func placardView(w: CGFloat, h: CGFloat) -> some View {
        Rectangle().fill(placard).frame(width: w * 0.3, height: h * 0.78).offset(x: w * 0.64, y: h * 0.11)
    }

    private var lines: some View {
        VStack(alignment: .leading, spacing: 3) {
            Capsule().fill(Theme.ink2).frame(width: 18, height: 3)
            Capsule().fill(Theme.ink3).frame(width: 24, height: 2)
            Capsule().fill(Theme.ink3).frame(width: 20, height: 2)
        }
    }
}
