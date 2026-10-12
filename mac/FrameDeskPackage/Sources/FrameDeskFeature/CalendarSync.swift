@preconcurrency import EventKit
import Foundation

/// Reads this week's meetings from every calendar on the Mac (iCloud, Google,
/// Exchange — whatever Calendar.app has) so the TV needs no secret iCal URL.
@MainActor
final class CalendarSync {
    private let store = EKEventStore()

    enum Access { case granted, denied, notDetermined }

    var access: Access {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess, .authorized: .granted
        case .notDetermined: .notDetermined
        default: .denied
        }
    }

    func requestAccess() async -> Bool {
        (try? await store.requestFullAccessToEvents()) ?? false
    }

    /// Fires when anything changes in Calendar, so we can resync promptly.
    func observeChanges(_ handler: @escaping @MainActor () -> Void) {
        NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: store, queue: .main) { _ in
            MainActor.assumeIsolated { handler() }
        }
    }

    /// The week's events in the shape the API wants. The server re-buckets
    /// timed events by the dashboard's time zone; all-day events carry dates.
    func events(weekOf monday: String, timeZone: TimeZone) -> [EventsDoc.Event] {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone
        let ymd = DateFormatter()
        ymd.calendar = cal
        ymd.timeZone = timeZone
        ymd.dateFormat = "yyyy-MM-dd"

        guard let start = ymd.date(from: monday),
              let from = cal.date(byAdding: .day, value: -1, to: start),
              let to = cal.date(byAdding: .day, value: 8, to: start) else { return [] }

        // Skip birthdays and subscribed calendars (holidays, sports…): they
        // aren't meetings and would crowd the TV.
        let calendars = store.calendars(for: .event).filter { $0.type != .birthday && $0.type != .subscription }
        let predicate = store.predicateForEvents(withStart: from, end: to, calendars: calendars)

        var out: [EventsDoc.Event] = []
        for e in store.events(matching: predicate) {
            if e.status == .canceled { continue }
            if let me = e.attendees?.first(where: \.isCurrentUser), me.participantStatus == .declined { continue }
            let title = (e.title?.isEmpty == false ? e.title : nil) ?? "Busy"
            let location = e.location.flatMap { $0.isEmpty ? nil : String($0.split(separator: "\n").first ?? "") }

            if e.isAllDay {
                // All-day spans: one entry per day, end is exclusive.
                guard let first = e.startDate else { continue }
                var day = cal.startOfDay(for: first)
                let end: Date = e.endDate ?? first
                repeat {
                    out.append(.init(title: title, location: location, allDay: true, date: ymd.string(from: day)))
                    guard let next = cal.date(byAdding: .day, value: 1, to: day) else { break }
                    day = next
                } while day < end
            } else {
                out.append(.init(title: title, location: location, allDay: false, start: e.startDate, end: e.endDate))
            }
        }
        return out
    }
}
