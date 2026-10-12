import SwiftUI

/// The popover under the menu bar icon.
public struct DeskView: View {
    @Bindable var model: DeskModel
    @State private var showSettings = false

    public init(model: DeskModel) { self.model = model }

    public var body: some View {
        VStack(spacing: 12) {
            if showSettings || !model.isConfigured {
                SettingsPanel(model: model) { showSettings = false }
            } else {
                header
                hero
                TasksTile(model: model)
                MeetingsTile(model: model)
                if let art = model.shownDay?.art { ArtTile(model: model, art: art) }
                WeekStrip(model: model)
                footer
            }
        }
        .padding(16)
        .frame(width: 380)
        .background(Theme.panel)
        .preferredColorScheme(.dark)
        .task { await model.refresh() }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .center) {
            Image(systemName: "photo.artframe")
                .font(.system(size: 15))
                .foregroundStyle(Theme.ink2)
            VStack(alignment: .leading, spacing: 1) {
                Text(model.dayTitle(model.shownDate, style: "EEEE"))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(model.isShowingToday ? Theme.ink : Theme.champagne)
                Text(model.dayTitle(model.shownDate, style: "MMMM d"))
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.ink2)
            }
            Spacer()
            RoundButton(symbol: "arrow.clockwise", spinning: model.isBusy) {
                Task {
                    await model.syncCalendar()
                    await model.refresh()
                }
            }
            .help("Sync now")
        }
    }

    // MARK: Hero — the meeting that matters right now, like the big "23°C"

    @ViewBuilder private var hero: some View {
        let day = model.shownDay
        VStack(alignment: .leading, spacing: 12) {
            if model.isShowingToday, let lead = model.lead, let start = lead.event.start {
                let end = lead.event.end ?? start
                let mins = Int(((lead.inProgress ? end : start).timeIntervalSince(model.now) / 60).rounded(.up))
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(lead.inProgress ? "\(mins)" : model.time(start))
                        .font(.system(size: 54, weight: .light, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink)
                    Text(lead.inProgress ? "min left" : (mins <= 90 ? "in \(mins) min" : "next"))
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.ink2)
                    Spacer()
                }
                Text(lead.event.title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                ProgressTrack(fraction: progress(lead.inProgress, start: start, end: end))
                if let focus = day?.focus {
                    Text(focus).font(Theme.serif(15)).foregroundStyle(Theme.ink2).lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                Text(day?.focus ?? (model.week?.planned == false ? "No plan yet — say “plan my week” to Claude" : "A clear day"))
                    .font(Theme.serif(day?.focus == nil ? 20 : 26))
                    .foregroundStyle(day?.focus == nil ? Theme.ink2 : Theme.ink)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true) // wrap, don't truncate
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 6)
            }
        }
        .tile(padding: 18)
    }

    /// In a meeting: how much of it has passed. Before one: the last 90
    /// minutes of waiting fill up like a slider.
    private func progress(_ inProgress: Bool, start: Date, end: Date) -> Double {
        if inProgress {
            let total = end.timeIntervalSince(start)
            return total > 0 ? model.now.timeIntervalSince(start) / total : 1
        }
        return 1 - min(1, max(0, start.timeIntervalSince(model.now) / (90 * 60)))
    }

    // MARK: Footer

    private var footer: some View {
        HStack(spacing: 8) {
            // A server problem outranks a calendar problem; both outrank "all good".
            let problem = model.error ?? (model.calendarSyncOn ? model.calendarStatus : nil)
            Image(systemName: problem == nil ? "checkmark.shield" : (model.error != nil ? "exclamationmark.triangle" : "calendar.badge.exclamationmark"))
                .foregroundStyle(problem == nil ? Theme.ink2 : Color.orange)
            Text(problem ?? syncedText)
                .font(.system(size: 12))
                .foregroundStyle(problem == nil ? Theme.ink2 : Color.orange)
                .lineLimit(1)
                .help(problem ?? syncedText)
            Spacer()
            Button { showSettings = true } label: {
                Image(systemName: "slider.horizontal.3").foregroundStyle(Theme.ink2)
            }
            .buttonStyle(.plain)
            .help("Settings")
        }
        .padding(.horizontal, 4)
    }

    private var syncedText: String {
        guard let last = model.lastSync else { return "Connecting…" }
        let f = DateFormatter()
        f.dateFormat = "h:mm"
        let cal = model.calendarSyncOn && model.week?.eventsSyncedAt != nil ? " · Calendar on" : ""
        return "Connected · synced \(f.string(from: last))\(cal)"
    }
}

struct ProgressTrack: View {
    let fraction: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.black.opacity(0.55))
                    .overlay(Capsule().strokeBorder(Theme.stroke))
                Capsule().fill(Theme.bar)
                    .frame(width: max(28, geo.size.width * min(1, max(0, fraction))))
                    .overlay(alignment: .trailing) {
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(Theme.ink)
                            .frame(width: 18, height: 26)
                            .shadow(color: .black.opacity(0.4), radius: 3)
                            .padding(.trailing, 4)
                    }
            }
        }
        .frame(height: 34)
        .animation(.easeOut(duration: 0.6), value: fraction)
    }
}

// MARK: - Tasks

struct TasksTile: View {
    @Bindable var model: DeskModel
    @State private var draft = ""
    @FocusState private var typing: Bool

    var body: some View {
        let tasks = model.shownDay?.tasks ?? []
        let done = tasks.filter(\.done).count
        VStack(alignment: .leading, spacing: 8) {
            Kicker(text: "To do", trailing: tasks.isEmpty ? nil : "\(done) of \(tasks.count) done")
            ForEach(Array(tasks.enumerated()), id: \.offset) { _, task in
                TaskRow(task: task,
                        toggle: { Task { await model.toggle(task) } },
                        remove: { Task { await model.remove(task) } })
            }
            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.ink3)
                    .frame(width: 20)
                TextField("Add a task", text: $draft)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.ink)
                    .focused($typing)
                    .onSubmit {
                        let text = draft
                        draft = ""
                        Task { await model.addTask(text) }
                        typing = true
                    }
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 8)
            .background(Color.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .tile()
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
                    Circle().strokeBorder(task.done ? Theme.champagne : Theme.ink3, lineWidth: 1.5)
                    if task.done {
                        Circle().fill(Theme.champagne).padding(3.5)
                    }
                }
                .frame(width: 20, height: 20)
            }
            .buttonStyle(.plain)

            Text(task.text)
                .font(.system(size: 13.5))
                .strikethrough(task.done, color: Theme.ink3)
                .foregroundStyle(task.done ? Theme.ink3 : Theme.ink)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture(perform: toggle)

            if hover {
                Button(action: remove) {
                    Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.ink2)
                }
                .buttonStyle(.plain)
                .help("Remove")
            } else if let tag = task.tag {
                Text(tag.uppercased()).font(Theme.label()).tracking(1).foregroundStyle(Theme.ink3)
            }
        }
        .padding(.vertical, 3)
        .onHover { hover = $0 }
    }
}

// MARK: - Meetings

struct MeetingsTile: View {
    @Bindable var model: DeskModel

    var body: some View {
        let events = model.shownDay?.events ?? []
        let timed = events.filter { !$0.allDay }
        let allDay = events.filter(\.allDay)
        VStack(alignment: .leading, spacing: 8) {
            Kicker(text: "Meetings", trailing: timed.isEmpty ? nil : "\(timed.count)")
            if !allDay.isEmpty {
                HStack(spacing: 6) {
                    ForEach(allDay) { e in
                        Text(e.title)
                            .font(.system(size: 11.5))
                            .foregroundStyle(Theme.ink2)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Capsule().fill(Theme.tileHi))
                    }
                }
            }
            if timed.isEmpty {
                Text("No meetings").font(Theme.serif(14)).foregroundStyle(Theme.ink3)
            }
            ForEach(timed) { e in
                let isNow = model.isShowingToday && (e.start ?? .distantFuture) <= model.now && (e.end ?? .distantPast) > model.now
                let past = model.isShowingToday && (e.end ?? .distantFuture) <= model.now
                HStack(spacing: 10) {
                    Text(model.time(e.start))
                        .font(.system(size: 12.5, weight: isNow ? .semibold : .regular))
                        .monospacedDigit()
                        .foregroundStyle(isNow ? Theme.champagne : Theme.ink2)
                        .frame(width: 44, alignment: .leading)
                    Text(e.title)
                        .font(.system(size: 13.5, weight: isNow ? .semibold : .regular))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .opacity(past ? 0.4 : 1)
            }
        }
        .tile()
    }
}

// MARK: - Today's painting, as on the TV

struct ArtTile: View {
    let model: DeskModel
    let art: DeskArt

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AsyncImage(url: model.artURL(art)) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Theme.tileHi
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.stroke))

            VStack(alignment: .leading, spacing: 3) {
                Text(art.title)
                    .font(Theme.serif(14.5))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Text([art.artist, art.date].compactMap { $0 }.joined(separator: ", "))
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.ink2)
                    .lineLimit(1)
                if let fact = art.fact {
                    Text(fact)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.ink3)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)
                }
            }
            Spacer(minLength: 0)
            if let s = art.factSource, let url = URL(string: s) {
                Link(destination: url) {
                    Image(systemName: "arrow.up.right").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.ink3)
                }
                .help("Read more on Wikipedia")
            }
        }
        .tile(padding: 12)
    }
}

// MARK: - Week, as four-by-two tiles in the reference; here seven slim ones

struct WeekStrip: View {
    @Bindable var model: DeskModel

    var body: some View {
        HStack(spacing: 6) {
            ForEach(model.week?.days ?? []) { day in
                let selected = day.date == model.shownDate
                let isToday = day.date == model.todayYmd
                Button {
                    model.selectedDate = isToday ? nil : day.date
                } label: {
                    VStack(spacing: 4) {
                        Text(model.dayTitle(day.date, style: "EEE").uppercased())
                            .font(.system(size: 9.5, weight: .semibold).width(.expanded))
                            .foregroundStyle(isToday ? Theme.champagne : Theme.ink3)
                        Text(model.dayTitle(day.date, style: "d"))
                            .font(.system(size: 16, weight: .medium, design: .rounded))
                            .foregroundStyle(day.date < model.todayYmd ? Theme.ink3 : Theme.ink)
                        HStack(spacing: 2) {
                            ForEach(0 ..< min(day.timed.count, 3), id: \.self) { _ in
                                Circle().fill(Theme.ink2).frame(width: 3.5, height: 3.5)
                            }
                        }
                        .frame(height: 4)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(selected ? Theme.tileHi : Theme.tile, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(selected ? Theme.champagne.opacity(0.6) : Theme.stroke)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}
