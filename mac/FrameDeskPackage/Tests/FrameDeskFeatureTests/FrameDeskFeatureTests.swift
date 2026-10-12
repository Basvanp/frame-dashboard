import Foundation
import Testing
@testable import FrameDeskFeature

/// A trimmed real response from GET /api/week decodes, including fractional
/// ISO dates and null tags.
@Test func decodesWeek() throws {
    let json = """
    {"tz":"America/Monterrey","today":"2026-10-12","weekOf":"2026-10-12","planned":true,
     "generatedAt":"2026-10-12T17:33:18.129Z","eventsSyncedAt":null,
     "days":[{"date":"2026-10-12","focus":"Ship it","note":null,
       "tasks":[{"text":"Write copy","done":false,"tag":null}],
       "events":[{"title":"Standup","location":null,"allDay":false,"date":"2026-10-12",
                  "start":"2026-10-12T15:30:00.000Z","end":"2026-10-12T15:45:00.000Z","calendar":0}],
       "art":{"title":"The Loire","artist":"Alfred Sisley","image":"art/sisley-the-loire.jpg"}}]}
    """
    let week = try DashboardAPI.testDecoder.decode(DeskWeek.self, from: Data(json.utf8))
    #expect(week.days.first?.tasks.first?.text == "Write copy")
    #expect(week.days.first?.timed.first?.start != nil)
}

import SwiftUI

/// Renders the popover with sample data to $SNAPSHOT_DIR/desk.png, for
/// eyeballing the design without the menu bar. Skipped unless the env is set.
@MainActor
@Test func snapshot() throws {
    guard let dir = ProcessInfo.processInfo.environment["SNAPSHOT_DIR"] else { return }
    let iso = ISO8601DateFormatter()
    func at(_ s: String) -> Date { iso.date(from: s)! }
    func ev(_ t: String, _ s: String, _ e: String, _ d: String = "2026-10-12") -> DeskEvent {
        DeskEvent(title: t, location: nil, allDay: false, date: d, start: at(s), end: at(e))
    }
    let days: [DeskDay] = (12...18).map { n in
        let date = "2026-10-\(n)"
        if n == 12 {
            return DeskDay(date: date, focus: "Finish the landing page copy before lunch",
                           tasks: [DeskTask(text: "Write hero and pricing copy", tag: "Site"),
                                   DeskTask(text: "Review Ana's onboarding mocks", tag: "Design"),
                                   DeskTask(text: "Send invoice to the agency", done: true),
                                   DeskTask(text: "Book flights for the conference")],
                           events: [ev("Team standup", "2026-10-12T15:30:00Z", "2026-10-12T15:45:00Z"),
                                    ev("Design review — onboarding", "2026-10-12T17:30:00Z", "2026-10-12T18:30:00Z"),
                                    ev("Client call — quarterly plan", "2026-10-12T22:30:00Z", "2026-10-12T23:15:00Z")],
                           art: nil)
        }
        return DeskDay(date: date, focus: nil, tasks: [], events: n < 17 ? [ev("x", "2026-10-\(n)T15:30:00Z", "2026-10-\(n)T15:45:00Z", date)] : [], art: nil)
    }
    let week = DeskWeek(tz: "America/Monterrey", today: "2026-10-12", weekOf: "2026-10-12", planned: true,
                        days: days, generatedAt: at("2026-10-12T15:30:00Z"), eventsSyncedAt: nil)
    let model = DeskModel(preview: week, now: at("2026-10-12T17:12:00Z")) // 11:12, 18 min before review
    let renderer = ImageRenderer(content: DeskView(model: model).fixedSize())
    renderer.scale = 2
    guard let image = renderer.nsImage, let tiff = image.tiffRepresentation,
          let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else {
        Issue.record("render failed"); return
    }
    try png.write(to: URL(fileURLWithPath: dir).appending(path: "desk.png"))
}
