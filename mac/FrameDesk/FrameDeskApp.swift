import FrameDeskFeature
import SwiftUI

@main
struct FrameDeskApp: App {
    @State private var model = DeskModel()

    var body: some Scene {
        MenuBarExtra {
            DeskView(model: model)
        } label: {
            MenuLabel(model: model)
        }
        .menuBarExtraStyle(.window)
    }
}
