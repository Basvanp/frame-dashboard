import CoreText
import Foundation

/// Instrument Serif (SIL Open Font License, see Fonts/OFL.txt): the same
/// display face as the TV, bundled so the app doesn't depend on what's
/// installed on the Mac.
enum Fonts {
    nonisolated(unsafe) private static var done = false

    static func register() {
        guard !done else { return }
        done = true
        for name in ["InstrumentSerif-Regular", "InstrumentSerif-Italic"] {
            if let url = Bundle.module.url(forResource: name, withExtension: "ttf") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }
}
