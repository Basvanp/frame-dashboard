import Foundation

// Mirrors the dashboard API (see ../../../../lib/week.js and lib/plan.js).

public struct DeskTask: Codable, Hashable, Sendable {
    public var text: String
    public var done: Bool
    public var tag: String?

    public init(text: String, done: Bool = false, tag: String? = nil) {
        self.text = text
        self.done = done
        self.tag = tag
    }
}

public struct DeskEvent: Codable, Hashable, Sendable, Identifiable {
    public var title: String
    public var location: String?
    public var allDay: Bool
    public var date: String
    public var start: Date?
    public var end: Date?

    public var id: String { "\(title)|\(start?.timeIntervalSince1970 ?? 0)|\(date)" }
}

public struct DeskArt: Codable, Hashable, Sendable {
    public var title: String
    public var artist: String
    public var date: String?
    public var image: String
    public var fact: String?
    public var factSource: String?
}

public struct DeskDay: Codable, Hashable, Sendable, Identifiable {
    public var date: String
    public var focus: String?
    public var tasks: [DeskTask]
    public var events: [DeskEvent]
    public var art: DeskArt?

    public var id: String { date }
    public var timed: [DeskEvent] { events.filter { !$0.allDay } }
    public var openTasks: Int { tasks.filter { !$0.done }.count }
}

public struct DeskWeek: Codable, Sendable {
    public var tz: String
    public var today: String
    public var weekOf: String
    public var planned: Bool
    public var days: [DeskDay]
    public var generatedAt: Date
    public var eventsSyncedAt: Date?

    public func day(_ ymd: String) -> DeskDay? { days.first { $0.date == ymd } }
}

/// The weekly plan as stored (PUT /api/plan replaces the whole week).
struct PlanDoc: Codable, Sendable {
    struct Day: Codable, Sendable {
        var focus: String?
        var note: String?
        var tasks: [DeskTask]
    }

    var weekOf: String
    var focus: String?
    var days: [String: Day]
}

/// Meetings read from the Mac's calendars (PUT /api/events).
struct EventsDoc: Codable, Sendable {
    struct Event: Codable, Sendable {
        var title: String
        var location: String?
        var allDay: Bool
        var date: String?
        var start: Date?
        var end: Date?
    }

    var weekOf: String
    var source: String
    var events: [Event]
}

public struct ArtPack: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var description: String?
    public var count: Int
}

public struct ScreenLayout: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var description: String?
}

struct ArtSettings: Codable, Sendable {
    var packs: [ArtPack]
    var enabled: [String]
    // Newer dashboards only.
    var layout: String?
    var layouts: [ScreenLayout]?
}
