import Foundation

enum APIError: LocalizedError {
    case notConfigured
    case unauthorized
    case server(Int, String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Add your dashboard URL and key in Settings."
        case .unauthorized: "The key was rejected. Check it in Settings."
        case let .server(code, message): "Server error \(code): \(message)"
        }
    }
}

/// Talks to the dashboard. One key does everything: the write key also reads.
struct DashboardAPI: Sendable {
    let baseURL: URL
    let key: String

    static var testDecoder: JSONDecoder { decoder }

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let s = try decoder.singleValueContainer().decode(String.self)
            if let date = ISO8601.withFraction.date(from: s) ?? ISO8601.plain.date(from: s) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "bad date \(s)"))
        }
        return d
    }()

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(ISO8601.withFraction.string(from: date))
        }
        return e
    }()

    private func request(_ path: String, query: [URLQueryItem] = [], method: String = "GET", body: Data? = nil) async throws -> Data {
        var comps = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { comps.queryItems = query }
        var req = URLRequest(url: comps.url!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        req.httpMethod = method
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 { throw APIError.unauthorized }
        guard (200 ..< 300).contains(code) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? "no details"
            throw APIError.server(code, message)
        }
        return data
    }

    func week(containing date: String? = nil) async throws -> DeskWeek {
        let q = date.map { [URLQueryItem(name: "date", value: $0)] } ?? []
        return try Self.decoder.decode(DeskWeek.self, from: try await request("api/week", query: q))
    }

    func plan(weekOf: String) async throws -> PlanDoc {
        let data = try await request("api/plan", query: [URLQueryItem(name: "week", value: weekOf)])
        return try Self.decoder.decode(PlanDoc.self, from: data)
    }

    func save(_ plan: PlanDoc) async throws {
        _ = try await request("api/plan", method: "PUT", body: try Self.encoder.encode(plan))
    }

    func artSettings() async throws -> ArtSettings {
        try Self.decoder.decode(ArtSettings.self, from: try await request("api/settings"))
    }

    func saveArtPacks(_ enabled: [String]) async throws {
        _ = try await request("api/settings", method: "PUT", body: try Self.encoder.encode(["packs": enabled]))
    }

    func saveLayout(_ layout: String) async throws {
        _ = try await request("api/settings", method: "PUT", body: try Self.encoder.encode(["layout": layout]))
    }

    func save(_ events: EventsDoc) async throws {
        _ = try await request("api/events", method: "PUT", body: try Self.encoder.encode(events))
    }
}

enum ISO8601 {
    nonisolated(unsafe) static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    nonisolated(unsafe) static let plain = ISO8601DateFormatter()
}
