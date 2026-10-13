import SwiftUI

/// The popover under the menu bar icon. It opens on today's painting — the
/// same one on the TV — with the day set over it, then the day's work below
/// as editorial sections rather than boxes.
public struct DeskView: View {
    @Bindable var model: DeskModel
    @State private var showSettings = false

    public init(model: DeskModel) { self.model = model }

    public var body: some View {
        VStack(spacing: 0) {
            if showSettings || !model.isConfigured {
                ScrollView {
                    SettingsPanel(model: model) { showSettings = false }
                }
                .scrollIndicators(.never)
                .frame(height: 620)
                .padding(16)
            } else {
                HeroArt(model: model)
                ArtCaption(model: model)
                VStack(alignment: .leading, spacing: 22) {
                    FocusLine(model: model)
                    TasksSection(model: model)
                    MeetingsSection(model: model)
                    WeekStrip(model: model)
                    footer
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 14)
            }
        }
        .frame(width: 380)
        .background(Theme.panel)
        .preferredColorScheme(.dark)
        .task { await model.refresh() }
    }

    private var footer: some View {
        HStack(spacing: 8) {
            // A server problem outranks a calendar problem; both outrank "all good".
            let problem = model.error ?? (model.calendarSyncOn ? model.calendarStatus : nil)
            Image(systemName: problem == nil ? "checkmark.shield" : (model.error != nil ? "exclamationmark.triangle" : "calendar.badge.exclamationmark"))
                .font(Theme.text(11))
                .foregroundStyle(problem == nil ? Theme.ink3 : Color.orange)
            Text(problem ?? syncedText)
                .font(Theme.text(11))
                .foregroundStyle(problem == nil ? Theme.ink3 : Color.orange)
                .lineLimit(1)
                .help(problem ?? syncedText)
            Spacer()
            Button { showSettings = true } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.ink2)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Settings")
        }
    }

    private var syncedText: String {
        guard let last = model.lastSync else { return "Connecting…" }
        let f = DateFormatter()
        f.dateFormat = "h:mm"
        let cal = model.calendarSyncOn && model.week?.eventsSyncedAt != nil ? " · Calendar on" : ""
        return "Synced \(f.string(from: last))\(cal)"
    }
}

// MARK: - The painting, with the day set over it

struct HeroArt: View {
    @Bindable var model: DeskModel

    var body: some View {
        let art = model.shownDay?.art
        ZStack(alignment: .topLeading) {
            // The painting, filling the frame; a quiet gradient until it loads.
            AsyncImage(url: art.flatMap(model.artURL), transaction: .init(animation: .easeOut(duration: 0.6))) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    LinearGradient(colors: [Theme.tileHi, Theme.panel], startPoint: .top, endPoint: .bottom)
                }
            }
            .frame(width: 380, height: 236)
            .clipped()

            // Legibility: a little shade at the top, more at the bottom.
            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0.55), location: 0),
                    .init(color: .black.opacity(0), location: 0.32),
                    .init(color: .black.opacity(0), location: 0.45),
                    .init(color: .black.opacity(0.88), location: 1),
                ],
                startPoint: .top, endPoint: .bottom
            )
            .frame(width: 380, height: 236)

            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(model.dayTitle(model.shownDate, style: "EEEE"))
                            .font(Theme.display(26))
                            .foregroundStyle(model.isShowingToday ? .white : Theme.champagne)
                        Text(model.dayTitle(model.shownDate, style: "MMMM d").uppercased())
                            .font(Theme.label())
                            .tracking(1.2)
                            .foregroundStyle(.white.opacity(0.75))
                    }
                    Spacer()
                    Button {
                        Task { await model.syncEverything() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(Theme.text(12, .semibold))
                            .foregroundStyle(.white)
                            .rotationEffect(.degrees(model.isBusy ? 360 : 0))
                            .animation(model.isBusy ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: model.isBusy)
                            .frame(width: 30, height: 30)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .help("Sync now: calendar, this Mac and the TV")
                }
                Spacer()
                NextUp(model: model)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 16)
            .frame(width: 380, height: 236, alignment: .topLeading)
        }
        .frame(width: 380, height: 236)
    }
}

/// Bottom of the hero: the meeting that matters now, set large.
struct NextUp: View {
    let model: DeskModel

    var body: some View {
        if model.isShowingToday, let lead = model.lead, let start = lead.event.start {
            let end = lead.event.end ?? start
            let mins = Int(((lead.inProgress ? end : start).timeIntervalSince(model.now) / 60).rounded(.up))
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(lead.inProgress ? "Now" : model.time(start))
                        .font(Theme.display(48))
                        .monospacedDigit()
                    Text(lead.inProgress ? "\(mins) min left" : (mins <= 90 ? "in \(mins) min" : "next"))
                        .font(Theme.text(13, .medium))
                        .foregroundStyle(Theme.champagne)
                }
                Text(lead.event.title)
                    .font(Theme.text(14, .semibold))
                    .lineLimit(1)
                Capsule()
                    .fill(.white.opacity(0.18))
                    .frame(height: 3)
                    .overlay(alignment: .leading) {
                        GeometryReader { geo in
                            Capsule().fill(Theme.champagne)
                                .frame(width: geo.size.width * progress(lead.inProgress, start: start, end: end))
                        }
                    }
                    .padding(.top, 6)
            }
            .foregroundStyle(.white)
        } else {
            VStack(alignment: .leading, spacing: 2) {
                Text(model.isShowingToday ? model.time(model.now) : model.dayTitle(model.shownDate, style: "MMM d"))
                    .font(Theme.display(48))
                    .monospacedDigit()
                Text(model.isShowingToday ? "Nothing else on the calendar" : "\(model.shownDay?.timed.count ?? 0) meetings")
                    .font(Theme.text(13, .medium))
                    .foregroundStyle(.white.opacity(0.75))
            }
            .foregroundStyle(.white)
        }
    }

    /// In a meeting: how much has passed. Before one: the last 90 minutes fill up.
    private func progress(_ inProgress: Bool, start: Date, end: Date) -> Double {
        let f: Double
        if inProgress {
            let total = end.timeIntervalSince(start)
            f = total > 0 ? model.now.timeIntervalSince(start) / total : 1
        } else {
            f = 1 - start.timeIntervalSince(model.now) / (90 * 60)
        }
        return min(1, max(0.02, f))
    }
}

/// The museum label, under the painting: title, artist, and the fact on demand.
struct ArtCaption: View {
    let model: DeskModel
    @State private var open = false

    var body: some View {
        if let art = model.shownDay?.art {
            VStack(alignment: .leading, spacing: 6) {
                Button { withAnimation(.easeOut(duration: 0.2)) { open.toggle() } } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(art.title)
                            .font(Theme.serif(15))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        Text("·").foregroundStyle(Theme.ink3)
                        Text(art.artist)
                            .font(Theme.text(11.5))
                            .foregroundStyle(Theme.ink2)
                            .lineLimit(1)
                            .layoutPriority(1)
                        Spacer(minLength: 4)
                        if art.fact != nil {
                            Image(systemName: open ? "chevron.up" : "info.circle")
                                .font(Theme.text(11))
                                .foregroundStyle(Theme.ink3)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(art.fact == nil)

                if open, let fact = art.fact {
                    Text(fact)
                        .font(Theme.text(12))
                        .foregroundStyle(Theme.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 10) {
                        if let date = art.date {
                            Text(date).font(Theme.text(11)).foregroundStyle(Theme.ink3)
                        }
                        Spacer()
                        if let s = art.factSource, let url = URL(string: s) {
                            Link(destination: url) {
                                Text(s.contains("wikipedia") ? "Wikipedia ↗" : "Museum ↗")
                                    .font(Theme.text(11, .medium))
                                    .foregroundStyle(Theme.champagne)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(Theme.tile)
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.stroke).frame(height: 1) }
        }
    }
}

// MARK: - Focus

struct FocusLine: View {
    let model: DeskModel

    var body: some View {
        let day = model.shownDay
        HStack(alignment: .top, spacing: 12) {
            Rectangle().fill(day?.focus == nil ? Theme.stroke : Theme.champagne).frame(width: 2)
            Text(day?.focus ?? (model.week?.planned == false ? "No plan yet — say “plan my week” to Claude" : "A clear day"))
                .font(Theme.serif(day?.focus == nil ? 19 : 23))
                .foregroundStyle(day?.focus == nil ? Theme.ink3 : Theme.ink)
                .lineSpacing(1)
                .fixedSize(horizontal: false, vertical: true)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Tasks

struct TasksSection: View {
    @Bindable var model: DeskModel
    @State private var draft = ""
    @State private var showAll = false
    @FocusState private var typing: Bool

    /// Beyond this the popover would outgrow a laptop screen.
    private let visible = 6

    var body: some View {
        let tasks = model.shownDay?.tasks ?? []
        let done = tasks.filter(\.done).count
        VStack(alignment: .leading, spacing: 4) {
            Kicker(text: "To do", trailing: tasks.isEmpty ? nil : "\(done) of \(tasks.count)")
                .padding(.bottom, 4)
            // Open first, finished sink — as on the TV.
            let ordered = tasks.filter { !$0.done } + tasks.filter(\.done)
            let shown = showAll ? ordered : Array(ordered.prefix(visible))
            ForEach(Array(shown.enumerated()), id: \.offset) { _, task in
                TaskRow(task: task,
                        toggle: { Task { await model.toggle(task) } },
                        remove: { Task { await model.remove(task) } })
            }
            if ordered.count > visible {
                Button(showAll ? "Show less" : "Show \(ordered.count - visible) more") {
                    withAnimation(.easeOut(duration: 0.2)) { showAll.toggle() }
                }
                .buttonStyle(.plain)
                .font(Theme.text(11.5, .medium))
                .foregroundStyle(Theme.champagne)
                .padding(.leading, 28)
                .padding(.vertical, 2)
            }
            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .font(Theme.text(11, .semibold))
                    .foregroundStyle(Theme.ink3)
                    .frame(width: 18)
                TextField("Add a task", text: $draft)
                    .textFieldStyle(.plain)
                    .font(Theme.text(13))
                    .foregroundStyle(Theme.ink)
                    .focused($typing)
                    .onSubmit {
                        let text = draft
                        draft = ""
                        Task { await model.addTask(text) }
                        typing = true
                    }
            }
            .padding(.vertical, 7)
            .overlay(alignment: .bottom) {
                Rectangle().fill(typing ? Theme.champagne.opacity(0.6) : Theme.stroke).frame(height: 1)
            }
        }
    }
}

struct TaskRow: View {
    let task: DeskTask
    let toggle: () -> Void
    let remove: () -> Void
    @State private var hover = false

    var body: some View {
        HStack(spacing: 10) {
            Button(action: toggle) {
                ZStack {
                    Circle().strokeBorder(task.done ? Theme.champagne.opacity(0.7) : (hover ? Theme.ink2 : Theme.ink3), lineWidth: 1.25)
                    if task.done {
                        Image(systemName: "checkmark").font(.system(size: 8, weight: .bold)).foregroundStyle(Theme.champagne)
                    }
                }
                .frame(width: 18, height: 18)
                // A ring is only its stroke to hit-testing; make the whole
                // circle, and a margin around it, clickable.
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(task.done ? "Mark as not done" : "Mark as done")

            Text(task.text)
                .font(Theme.text(13))
                .strikethrough(task.done, color: Theme.ink3)
                .foregroundStyle(task.done ? Theme.ink3 : Theme.ink)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture(perform: toggle)

            if hover {
                Button(action: remove) {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Theme.ink2)
                        .frame(width: 26, height: 26) // a glyph alone is a 9-point target
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Remove")
            } else if let tag = task.tag {
                Text(tag.uppercased()).font(Theme.text(9.5, .semibold)).tracking(0.8).foregroundStyle(Theme.ink3)
            }
        }
        .padding(.vertical, 1)
        .onHover { hover = $0 }
    }
}

// MARK: - Meetings

struct MeetingsSection: View {
    @Bindable var model: DeskModel

    var body: some View {
        let events = model.shownDay?.events ?? []
        let timed = events.filter { !$0.allDay }
        let allDay = events.filter(\.allDay)
        VStack(alignment: .leading, spacing: 6) {
            Kicker(text: "Meetings", trailing: timed.isEmpty ? nil : "\(timed.count)")
                .padding(.bottom, 2)
            if !allDay.isEmpty {
                Text(allDay.map(\.title).joined(separator: "  ·  "))
                    .font(Theme.text(11.5))
                    .foregroundStyle(Theme.ink3)
                    .lineLimit(1)
            }
            if timed.isEmpty {
                Text("No meetings").font(Theme.serif(16)).foregroundStyle(Theme.ink3)
            }
            ForEach(timed) { e in
                let isNow = model.isShowingToday && (e.start ?? .distantFuture) <= model.now && (e.end ?? .distantPast) > model.now
                let past = model.isShowingToday && (e.end ?? .distantFuture) <= model.now
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(model.time(e.start))
                        .font(Theme.display(17))
                        .monospacedDigit()
                        .foregroundStyle(isNow ? Theme.champagne : Theme.ink2)
                        .frame(width: 42, alignment: .leading)
                    Text(e.title)
                        .font(Theme.text(13, isNow ? .semibold : .regular))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .opacity(past ? 0.4 : 1)
            }
        }
    }
}

// MARK: - Week

struct WeekStrip: View {
    @Bindable var model: DeskModel

    var body: some View {
        HStack(spacing: 0) {
            ForEach(model.week?.days ?? []) { day in
                let selected = day.date == model.shownDate
                let isToday = day.date == model.todayYmd
                Button {
                    model.selectedDate = isToday ? nil : day.date
                } label: {
                    VStack(spacing: 3) {
                        Text(model.dayTitle(day.date, style: "EEEEE"))
                            .font(Theme.text(10, .semibold))
                            .foregroundStyle(isToday ? Theme.champagne : Theme.ink3)
                        Text(model.dayTitle(day.date, style: "d"))
                            .font(Theme.display(22))
                            .foregroundStyle(day.date < model.todayYmd ? Theme.ink3 : Theme.ink)
                        HStack(spacing: 2) {
                            ForEach(0 ..< min(day.timed.count, 3), id: \.self) { _ in
                                Circle().fill(Theme.ink3).frame(width: 3, height: 3)
                            }
                        }
                        .frame(height: 3)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 7)
                    .background(selected ? Theme.tileHi : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(alignment: .top) {
                        if isToday { Capsule().fill(Theme.champagne).frame(width: 14, height: 2) }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 2)
        .overlay(alignment: .top) { Rectangle().fill(Theme.stroke).frame(height: 1).offset(y: -10) }
    }
}
