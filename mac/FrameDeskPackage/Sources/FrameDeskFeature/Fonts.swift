import CoreText
import Foundation

/// The TV's two faces, bundled so the app doesn't depend on what's installed:
/// Instrument Serif for display, Geist (variable) for text. Both SIL Open Font
/// License; see Fonts/OFL-*.txt.
enum Fonts {
    nonisolated(unsafe) private static var done = false

    static func register() {
        guard !done else { return }
        done = true
        for name in ["InstrumentSerif-Regular", "InstrumentSerif-Italic", "Geist-Variable"] {
            if let url = Bundle.module.url(forResource: name, withExtension: "ttf") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }
}
