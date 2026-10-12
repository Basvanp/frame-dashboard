import SwiftUI

/// Black glass, raised tiles, one champagne accent — the language of a
/// premium appliance remote, with the TV dashboard's serif for the focus line.
enum Theme {
    static let panel = Color(red: 0.035, green: 0.035, blue: 0.04)
    static let tile = Color(red: 0.085, green: 0.085, blue: 0.09)
    static let tileHi = Color(red: 0.12, green: 0.12, blue: 0.125)
    static let stroke = Color.white.opacity(0.07)
    static let ink = Color(red: 0.95, green: 0.94, blue: 0.92)
    static let ink2 = Color(red: 0.62, green: 0.61, blue: 0.59)
    static let ink3 = Color(red: 0.42, green: 0.41, blue: 0.40)
    static let champagne = Color(red: 0.86, green: 0.80, blue: 0.70)
    static let champagneDeep = Color(red: 0.36, green: 0.32, blue: 0.27)

    static let bar = LinearGradient(
        colors: [champagneDeep.opacity(0.6), champagne.opacity(0.95)],
        startPoint: .leading, endPoint: .trailing
    )

    static func serif(_ size: CGFloat) -> Font { .system(size: size, weight: .regular, design: .serif).italic() }
    static func label() -> Font { .system(size: 10.5, weight: .semibold).width(.expanded) }
}

struct TileStyle: ViewModifier {
    var padding: CGFloat = 14
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Theme.tile, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.stroke))
    }
}

extension View {
    func tile(padding: CGFloat = 14) -> some View { modifier(TileStyle(padding: padding)) }
}

/// Small caps label used above every block ("TO DO", "MEETINGS").
struct Kicker: View {
    let text: String
    var trailing: String? = nil
    var body: some View {
        HStack {
            Text(text.uppercased()).font(Theme.label()).tracking(1.2).foregroundStyle(Theme.ink3)
            Spacer()
            if let trailing { Text(trailing).font(.system(size: 11)).foregroundStyle(Theme.ink3) }
        }
    }
}

/// A round control like the power button in the reference.
struct RoundButton: View {
    let symbol: String
    var spinning = false
    let action: () -> Void
    @State private var hover = false

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(hover ? Theme.ink : Theme.ink2)
                .rotationEffect(.degrees(spinning ? 360 : 0))
                .animation(spinning ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: spinning)
                .frame(width: 34, height: 34)
                .background(Circle().fill(Theme.tileHi))
                .overlay(Circle().strokeBorder(Theme.stroke))
                .shadow(color: .black.opacity(0.5), radius: 6, y: 3)
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}
