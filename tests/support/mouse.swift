// Test utility: moves the real mouse pointer along a path (no clicks, no permissions needed).
// Usage: mouse x1 y1 x2 y2 seconds   (global top-left points)
import CoreGraphics
import Foundation
let a = CommandLine.arguments.dropFirst().compactMap { Double($0) }
guard a.count == 5 else { exit(2) }
let steps = Int(a[4] * 60)
for i in 0...steps {
    let k = Double(i) / Double(max(1, steps))
    let e = k < 0.5 ? 2 * k * k : 1 - pow(-2 * k + 2, 2) / 2
    CGWarpMouseCursorPosition(CGPoint(x: a[0] + (a[2] - a[0]) * e, y: a[1] + (a[3] - a[1]) * e))
    usleep(16_667)
}
