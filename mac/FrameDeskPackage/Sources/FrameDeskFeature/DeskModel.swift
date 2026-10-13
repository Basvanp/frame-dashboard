import Foundation
import Observation

@MainActor
@Observable
public final class DeskModel {
    // What the popover shows
    var week: DeskWeek?
    var selectedDate: String? // nil = today
    var now = Date()
    var isBusy = false
    var error: String?
    var lastSync: Date?
    var calendarStatus: String?

    // Art packs (which collections the TV draws paintings from)
    var artPacks: [ArtPack] = []
    var enabledPacks: Set<String> = []
    var layouts: [ScreenLayout] = []
    var layout: String?

    // Settings
    var baseURL: String { didSet { UserDefaults.standard.set(baseURL, forKey: "baseURL") } }
    var calendarSyncOn: Bool { didSet { UserDefaults.standard.set(calendarSyncOn, forKey: "calendarSync") } }
    private(set) var hasKey: Bool

    private let calendar = CalendarSync()
    private var pendingCalendarSync: Task<Void, Never>?

    public init() {
        Fonts.register()
        baseURL = UserDefaults.standard.string(forKey: "baseURL") ?? ""
        calendarSyncOn = UserDefaults.standard.object(forKey: "calendarSync") as? Bool ?? true
        hasKey = Keychain.read() != nil
        calendar.observeChanges { [weak self] in self?.scheduleCalendarSync(after: 3) }
        startLoops()
    }

    /// For previews and snapshot tests: fixed data, no network, no timers.
    init(preview week: DeskWeek, now: Date) {
        Fonts.register()
        baseURL = "https://example.com"
        calendarSyncOn = true
        hasKey = true
        previewConfigured = true
        self.week = week
        self.now = now
        lastSync = now
    }

    private var previewConfigured = false

    public var isConfigured: Bool { previewConfigured || api != nil }

    private var api: DashboardAPI? {
        guard let url = URL(string: baseURL.trimmingCharacters(in: .whitespaces)),
              url.scheme?.hasPrefix("http") == true,
              let key = Keychain.read(), !key.isEmpty else { return nil }
        return DashboardAPI(baseURL: url, key: key)
    }

    var timeZone: TimeZone { week.flatMap { TimeZone(identifier: $0.tz) } ?? .current }

    // MARK: Derived

    var todayYmd: String { week?.today ?? Self.ymd(now, timeZone) }
    var shownDate: String { selectedDate ?? todayYmd }
    var shownDay: DeskDay? { week?.day(shownDate) }
    var isShowingToday: Bool { selectedDate == nil || selectedDate == todayYmd }

    /// The meeting in progress, else the next one today.
    var lead: (event: DeskEvent, inProgress: Bool)? {
        guard let today = week?.day(todayYmd) else { return nil }
        for e in today.timed {
            guard let s = e.start, let end = e.end else { continue }
            if s <= now && end > now { return (e, true) }
            if s > now { return (e, false) }
        }
        return nil
    }

    /// The text beside the menu bar icon, like the "23°" in a thermostat.
    var menuTitle: String {
        if let lead, let start = lead.event.start {
            let mins = Int(((lead.inProgress ? (lead.event.end ?? start) : start).timeIntervalSince(now) / 60).rounded(.up))
            if lead.inProgress { return "\(short(lead.event.title)) · \(mins)m left" }
            if mins <= 90 { return "\(short(lead.event.title)) in \(mins)m" }
        }
        let open = week?.day(todayYmd)?.openTasks ?? 0
        return open > 0 ? "\(open) to do" : ""
    }

    private func short(_ s: String) -> String { s.count > 18 ? String(s.prefix(17)) + "…" : s }

    /// The painting image, served by the dashboard itself.
    /// `art.image` is relative to the dashboard ("art/x.jpg" or
    /// "_vercel/image?url=…") or, in local development, absolute. Resolve it
    /// as a URL reference so the query string survives.
    func artURL(_ art: DeskArt) -> URL? {
        var base = baseURL.trimmingCharacters(in: .whitespaces)
        if !base.hasSuffix("/") { base += "/" }
        return URL(string: art.image, relativeTo: URL(string: base))?.absoluteURL
    }

    // MARK: Loops

    private func startLoops() {
        Task { [weak self] in
            while let self {
                self.now = Date()
                try? await Task.sleep(for: .seconds(20))
            }
        }
        Task { [weak self] in
            while let self {
                await self.refresh()
                try? await Task.sleep(for: .seconds(120))
            }
        }
        scheduleCalendarSync(after: 2)
    }

    // MARK: Actions

    func refresh() async {
        guard let api else { error = nil; return }
        do {
            week = try await api.week()
            error = nil
            lastSync = Date()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func saveSettings(url: String, key: String) async {
        baseURL = url
        if !key.isEmpty { Keychain.write(key) }
        hasKey = Keychain.read() != nil
        await refresh()
        scheduleCalendarSync(after: 0)
    }

    func addTask(_ text: String) async {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        await editTasks { $0.append(DeskTask(text: text)) }
    }

    func toggle(_ task: DeskTask) async {
        await editTasks { tasks in
            if let i = tasks.firstIndex(of: task) { tasks[i].done.toggle() }
        }
    }

    func remove(_ task: DeskTask) async {
        await editTasks { tasks in tasks.removeAll { $0 == task } }
    }

    /// Edits the shown day's tasks: optimistic locally, then read-modify-write
    /// against the server's current plan, so an edit made elsewhere (Claude,
    /// another Mac) since our last refresh isn't lost.
    private func editTasks(_ change: (inout [DeskTask]) -> Void) async {
        guard let api, let week else { return }
        let date = shownDate
        if let i = self.week?.days.firstIndex(where: { $0.date == date }) {
            change(&self.week!.days[i].tasks)
        }
        isBusy = true
        defer { isBusy = false }
        do {
            var plan = try await api.plan(weekOf: week.weekOf)
            var day = plan.days[date] ?? .init(focus: nil, note: nil, tasks: [])
            change(&day.tasks)
            plan.days[date] = day
            try await api.save(plan)
            await refresh()
        } catch {
            self.error = error.localizedDescription
            await refresh()
        }
    }

    // MARK: Art packs

    func loadArtPacks() async {
        guard let api else { return }
        do {
            let s = try await api.artSettings()
            artPacks = s.packs
            enabledPacks = Set(s.enabled)
            layouts = s.layouts ?? []
            layout = s.layout
        } catch {
            self.error = error.localizedDescription
        }
    }

    func setPack(_ id: String, on: Bool) async {
        guard let api else { return }
        var next = enabledPacks
        if on { next.insert(id) } else { next.remove(id) }
        guard !next.isEmpty else { return } // keep at least one
        enabledPacks = next
        do {
            try await api.saveArtPacks(artPacks.map(\.id).filter(next.contains))
            await refresh()
        } catch {
            self.error = error.localizedDescription
            await loadArtPacks()
        }
    }

    func setLayout(_ id: String) async {
        guard let api, id != layout else { return }
        let before = layout
        layout = id
        do {
            try await api.saveLayout(id)
        } catch {
            layout = before
            self.error = error.localizedDescription
        }
    }

    // MARK: Calendar

    private func scheduleCalendarSync(after seconds: Double) {
        pendingCalendarSync?.cancel()
        pendingCalendarSync = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled, let self else { return }
            // Run the sync in its own task: rescheduling cancels the wait,
            // never a sync already on the wire.
            await Task { await self.syncCalendar() }.value
            // And again every 10 minutes, in case nothing fires a change.
            self.scheduleCalendarSync(after: 600)
        }
    }

    func syncCalendar() async {
        guard calendarSyncOn, let api else { return }
        if calendar.access == .notDetermined { _ = await calendar.requestAccess() }
        guard calendar.access == .granted else {
            calendarStatus = "Calendar access is off. Allow it in System Settings → Privacy & Security → Calendars."
            return
        }
        if week == nil { await refresh() }
        guard let week else { return }
        let events = calendar.events(weekOf: week.weekOf, timeZone: timeZone)
        do {
            try await api.save(EventsDoc(weekOf: week.weekOf, source: "Frame Desk (Mac)", events: events))
            calendarStatus = nil
            await refresh()
        } catch is CancellationError {
            // Superseded by a newer sync; not a problem worth showing.
        } catch let error as URLError where error.code == .cancelled {
            // Same, from URLSession.
        } catch {
            calendarStatus = error.localizedDescription
        }
    }

    // MARK: Formatting

    static func ymd(_ date: Date, _ tz: TimeZone) -> String {
        let f = DateFormatter()
        f.timeZone = tz
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    func time(_ date: Date?) -> String {
        guard let date else { return "" }
        let f = DateFormatter()
        f.timeZone = timeZone
        f.dateFormat = "h:mm"
        return f.string(from: date)
    }

    func dayTitle(_ ymd: String, style: String = "EEEE, MMMM d") -> String {
        let p = DateFormatter()
        p.timeZone = .gmt
        p.dateFormat = "yyyy-MM-dd"
        guard let d = p.date(from: ymd) else { return ymd }
        let f = DateFormatter()
        f.timeZone = .gmt
        f.dateFormat = style
        return f.string(from: d)
    }
}
