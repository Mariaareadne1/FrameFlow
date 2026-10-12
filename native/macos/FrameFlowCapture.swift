// FrameFlowCapture — the native macOS capture helper for FrameFlow.
//
// Commands (all output is JSON, one object per line, on stdout):
//   permission                          {"event":"permission","screen":true|false}
//   list                                {"event":"sources","displays":[...],"windows":[...]}
//   record --out-dir DIR (--display ID | --window ID) [--fps N] [--max-width PX]
//          [--exclude-pid PID] [--mic]
//       emits {"event":"started",...}, periodic {"event":"progress",...}, then
//       {"event":"stopped","video":...,"cursor":...,"duration":...} or {"event":"error",...}
//       Recording stops on a "stop" line on stdin, stdin EOF, SIGINT or SIGTERM. The file is
//       always finalized so a recording survives the parent app quitting.
//
// The system cursor is excluded from the video (showsCursor = false). Cursor position and
// clicks are sampled on the same host clock as the video frames and written next to the
// video as normalized coordinates, so FrameFlow can render a smooth cursor without
// duplicating the real one.
//
// Testing aid: with FRAMEFLOW_CAPTURE_SYNTHETIC=1, `record` produces a synthetic moving
// test pattern and scripted cursor instead of capturing the screen. It exercises the exact
// same writer, telemetry and process protocol, and needs no Screen Recording permission.

import AppKit
import AVFoundation
import CoreMedia
import Foundation
import QuartzCore
import ScreenCaptureKit

// MARK: - Output

let stdoutLock = NSLock()

func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]),
          let line = String(data: data, encoding: .utf8) else { return }
    stdoutLock.lock()
    FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
    stdoutLock.unlock()
}

func fail(_ message: String, code: String = "error") -> Never {
    emit(["event": "error", "code": code, "message": message])
    exit(1)
}

// MARK: - Arguments

struct Options {
    var command = ""
    var outDir = ""
    var displayID: CGDirectDisplayID?
    var windowID: CGWindowID?
    var fps = 60
    var maxWidth = 3840
    var excludePid: pid_t?
    var microphone = false

    static func parse(_ args: [String]) -> Options {
        var o = Options()
        var it = args.dropFirst().makeIterator()
        o.command = it.next() ?? ""
        while let arg = it.next() {
            switch arg {
            case "--out-dir": o.outDir = it.next() ?? ""
            case "--display": o.displayID = it.next().flatMap { UInt32($0) }
            case "--window": o.windowID = it.next().flatMap { UInt32($0) }
            case "--fps": o.fps = max(10, min(120, Int(it.next() ?? "") ?? 60))
            case "--max-width": o.maxWidth = max(640, Int(it.next() ?? "") ?? 3840)
            case "--exclude-pid": o.excludePid = it.next().flatMap { Int32($0) }
            case "--mic": o.microphone = true
            default: fail("Unknown argument \(arg)", code: "usage")
            }
        }
        return o
    }
}

// MARK: - Geometry helpers

/// Global top-left-origin rectangle of the area being captured.
func displayBounds(_ id: CGDirectDisplayID) -> CGRect { CGDisplayBounds(id) }

func windowBounds(_ id: CGWindowID) -> CGRect? {
    guard let info = CGWindowListCopyWindowInfo([.optionIncludingWindow], id) as? [[String: Any]],
          let first = info.first,
          let dict = first[kCGWindowBounds as String] as? NSDictionary,
          let rect = CGRect(dictionaryRepresentation: dict) else { return nil }
    return rect
}

/// Mouse location in global top-left-origin coordinates (CoreGraphics space).
func mouseLocationTopLeft() -> CGPoint {
    let loc = NSEvent.mouseLocation
    let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
    return CGPoint(x: loc.x, y: primaryHeight - loc.y)
}

func even(_ v: Double) -> Int { max(2, Int((v / 2).rounded()) * 2) }

// MARK: - Cursor telemetry

final class CursorRecorder {
    private var samples: [(t: Double, x: Double, y: Double)] = []
    private var clicks: [(t: Double, x: Double, y: Double, button: String)] = []
    private var timer: Timer?
    private var monitor: Any?
    private var lastButtons = 0
    private var lastClickTime: [String: Double] = [:]
    private var bounds: () -> CGRect
    private var lastBoundsRefresh = 0.0
    private var cachedBounds = CGRect.zero
    private let lock = NSLock()

    init(bounds: @escaping () -> CGRect) {
        self.bounds = bounds
        cachedBounds = bounds()
    }

    func start(rate: Double) {
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / rate, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(timer!, forMode: .common)
        // Global mouse-down monitoring needs no Accessibility permission (key events would).
        monitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            self?.recordClick(button: event.type == .rightMouseDown ? "right" : "left")
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        if let m = monitor { NSEvent.removeMonitor(m) }
        monitor = nil
    }

    private func currentBounds(_ now: Double) -> CGRect {
        if now - lastBoundsRefresh > 0.1 {
            cachedBounds = bounds()
            lastBoundsRefresh = now
        }
        return cachedBounds
    }

    private func normalized(_ p: CGPoint, _ r: CGRect) -> (Double, Double) {
        guard r.width > 0, r.height > 0 else { return (0.5, 0.5) }
        return (Double((p.x - r.minX) / r.width), Double((p.y - r.minY) / r.height))
    }

    private func tick() {
        let now = CACurrentMediaTime()
        let (x, y) = normalized(mouseLocationTopLeft(), currentBounds(now))
        lock.lock()
        samples.append((now, x, y))
        lock.unlock()
        // Polling fallback for clicks, in case global monitoring is unavailable.
        let buttons = NSEvent.pressedMouseButtons
        if buttons & 1 != 0 && lastButtons & 1 == 0 { recordClick(button: "left") }
        if buttons & 2 != 0 && lastButtons & 2 == 0 { recordClick(button: "right") }
        lastButtons = buttons
    }

    private func recordClick(button: String) {
        let now = CACurrentMediaTime()
        lock.lock()
        defer { lock.unlock() }
        if let last = lastClickTime[button], now - last < 0.08 { return }
        lastClickTime[button] = now
        let (x, y) = normalized(mouseLocationTopLeft(), currentBounds(now))
        clicks.append((now, x, y, button))
    }

    /// Injects telemetry directly (synthetic mode).
    func inject(t: Double, x: Double, y: Double, click: Bool) {
        lock.lock()
        samples.append((t, x, y))
        if click { clicks.append((t, x, y, "left")) }
        lock.unlock()
    }

    /// Writes telemetry relative to `origin` (host seconds of the first video frame).
    func write(to url: URL, origin: Double, duration: Double) throws {
        lock.lock()
        let s = samples.filter { $0.t >= origin - 0.5 }.map { s -> [String: Double] in
            ["t": max(0, min(duration, s.t - origin)), "x": s.x, "y": s.y]
        }
        let c = clicks.filter { $0.t >= origin && $0.t - origin <= duration }.map { c -> [String: Any] in
            ["t": c.t - origin, "x": c.x, "y": c.y, "button": c.button]
        }
        lock.unlock()
        let doc: [String: Any] = ["version": 1, "samples": s, "clicks": c]
        let data = try JSONSerialization.data(withJSONObject: doc)
        try data.write(to: url, options: .atomic)
    }
}

// MARK: - Writer

final class MovieWriter {
    let url: URL
    private let writer: AVAssetWriter
    private let videoInput: AVAssetWriterInput
    private var audioInput: AVAssetWriterInput?
    private(set) var firstPTS: CMTime?
    private var lastVideo: CMSampleBuffer?
    private(set) var lastPTS = CMTime.invalid
    private(set) var framesWritten = 0
    private(set) var framesDropped = 0
    private let queue = DispatchQueue(label: "frameflow.writer")

    init(url: URL, width: Int, height: Int, fps: Int, audio: Bool) throws {
        self.url = url
        try? FileManager.default.removeItem(at: url)
        writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
        // Write in fragments so a crash still leaves a playable file.
        writer.movieFragmentInterval = CMTime(seconds: 2, preferredTimescale: 600)
        let bitrate = min(60_000_000, max(8_000_000, Int(Double(width * height * fps) * 0.12)))
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: bitrate,
                AVVideoExpectedSourceFrameRateKey: fps,
                AVVideoMaxKeyFrameIntervalKey: fps * 2,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoAllowFrameReorderingKey: false,
            ],
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ],
        ]
        videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        videoInput.expectsMediaDataInRealTime = true
        guard writer.canAdd(videoInput) else { throw NSError(domain: "FrameFlow", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot add video track"]) }
        writer.add(videoInput)
        if audio {
            let a = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48_000,
                AVNumberOfChannelsKey: 2,
                AVEncoderBitRateKey: 160_000,
            ])
            a.expectsMediaDataInRealTime = true
            if writer.canAdd(a) {
                writer.add(a)
                audioInput = a
            }
        }
        guard writer.startWriting() else {
            throw writer.error ?? NSError(domain: "FrameFlow", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot start writing"])
        }
    }

    func appendVideo(_ sb: CMSampleBuffer) {
        queue.sync {
            let pts = CMSampleBufferGetPresentationTimeStamp(sb)
            if firstPTS == nil {
                writer.startSession(atSourceTime: pts)
                firstPTS = pts
            }
            guard writer.status == .writing else { return }
            if lastPTS.isValid && pts <= lastPTS { return }
            if videoInput.isReadyForMoreMediaData {
                if videoInput.append(sb) {
                    framesWritten += 1
                    lastVideo = sb
                    lastPTS = pts
                }
            } else {
                framesDropped += 1
            }
        }
    }

    func appendAudio(_ sb: CMSampleBuffer) {
        queue.sync {
            guard let input = audioInput, let first = firstPTS, writer.status == .writing else { return }
            guard CMSampleBufferGetPresentationTimeStamp(sb) >= first else { return }
            if input.isReadyForMoreMediaData { input.append(sb) }
        }
    }

    /// Finalizes the movie. Repeats the last frame at `end` so idle tails keep their length.
    func finish(end: CMTime, completion: @escaping (Error?) -> Void) {
        queue.sync {
            guard let first = firstPTS else {
                writer.cancelWriting()
                completion(NSError(domain: "FrameFlow", code: 3, userInfo: [NSLocalizedDescriptionKey: "No frames were captured."]))
                return
            }
            var finalEnd = end
            if let last = lastVideo, end > lastPTS + CMTime(value: 1, timescale: 60), writer.status == .writing {
                var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: end, decodeTimeStamp: .invalid)
                var copy: CMSampleBuffer?
                if CMSampleBufferCreateCopyWithNewTiming(allocator: nil, sampleBuffer: last, sampleTimingEntryCount: 1, sampleTimingArray: &timing, sampleBufferOut: &copy) == noErr,
                   let copy, videoInput.isReadyForMoreMediaData, videoInput.append(copy) {
                    lastPTS = end
                }
            }
            if finalEnd < lastPTS { finalEnd = lastPTS }
            videoInput.markAsFinished()
            audioInput?.markAsFinished()
            writer.endSession(atSourceTime: max(finalEnd, first))
            let w = writer
            writer.finishWriting { completion(w.status == .completed ? nil : w.error) }
        }
    }
}

// MARK: - Recording session

final class RecordingSession: NSObject, SCStreamOutput, SCStreamDelegate {
    let options: Options
    let videoURL: URL
    let cursorURL: URL
    var stream: SCStream?
    var writer: MovieWriter?
    var cursor: CursorRecorder?
    var width = 0
    var height = 0
    var stopping = false
    var progressTimer: Timer?
    let sampleQueue = DispatchQueue(label: "frameflow.capture", qos: .userInteractive)

    init(options: Options) {
        self.options = options
        let dir = URL(fileURLWithPath: options.outDir, isDirectory: true)
        videoURL = dir.appendingPathComponent("recording.mp4")
        cursorURL = dir.appendingPathComponent("cursor.json")
    }

    func start() async {
        do {
            try FileManager.default.createDirectory(at: videoURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            if ProcessInfo.processInfo.environment["FRAMEFLOW_CAPTURE_SYNTHETIC"] == "1" {
                try await MainActor.run { try startSynthetic() }
                return
            }
            try await startCapture()
        } catch {
            fail(describe(error), code: errorCode(error))
        }
    }

    private func describe(_ error: Error) -> String { (error as NSError).localizedDescription }

    private func errorCode(_ error: Error) -> String {
        let ns = error as NSError
        if ns.domain == SCStreamErrorDomain && ns.code == SCStreamError.userDeclined.rawValue { return "permission-denied" }
        return "capture-failed"
    }

    private func startCapture() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        let filter: SCContentFilter
        let boundsProvider: () -> CGRect
        if let wid = options.windowID {
            guard let window = content.windows.first(where: { $0.windowID == wid }) else {
                fail("The selected window is no longer available.", code: "source-missing")
            }
            filter = SCContentFilter(desktopIndependentWindow: window)
            let fallback = window.frame
            boundsProvider = { windowBounds(wid) ?? fallback }
        } else {
            let id = options.displayID ?? CGMainDisplayID()
            guard let display = content.displays.first(where: { $0.displayID == id }) else {
                fail("The selected display is no longer available.", code: "source-missing")
            }
            let excluded = content.applications.filter { app in
                app.processID == options.excludePid || app.processID == getpid()
            }
            filter = SCContentFilter(display: display, excludingApplications: excluded, exceptingWindows: [])
            boundsProvider = { displayBounds(id) }
        }
        let rect = filter.contentRect
        let scale = Double(filter.pointPixelScale)
        var w = Double(rect.width) * scale
        var h = Double(rect.height) * scale
        if w > Double(options.maxWidth) {
            h = h * Double(options.maxWidth) / w
            w = Double(options.maxWidth)
        }
        width = even(w)
        height = even(h)

        let config = SCStreamConfiguration()
        config.width = width
        config.height = height
        config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(options.fps))
        config.queueDepth = 6
        config.showsCursor = false
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.colorSpaceName = CGColorSpace.sRGB
        var wantsMic = false
        if options.microphone, #available(macOS 15.0, *) {
            config.captureMicrophone = true
            wantsMic = true
        }

        writer = try MovieWriter(url: videoURL, width: width, height: height, fps: options.fps, audio: wantsMic)
        let s = SCStream(filter: filter, configuration: config, delegate: self)
        try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleQueue)
        if wantsMic, #available(macOS 15.0, *) {
            try s.addStreamOutput(self, type: .microphone, sampleHandlerQueue: sampleQueue)
        }
        stream = s
        await MainActor.run {
            let c = CursorRecorder(bounds: boundsProvider)
            c.start(rate: 60)
            cursor = c
        }
        try await s.startCapture()
        await MainActor.run { announceStarted(microphone: wantsMic) }
    }

    @MainActor private func announceStarted(microphone: Bool) {
        emit(["event": "started", "width": width, "height": height, "fps": options.fps, "microphone": microphone, "video": videoURL.path])
        progressTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self, let w = self.writer, let first = w.firstPTS else { return }
            emit(["event": "progress", "seconds": max(0, CACurrentMediaTime() - first.seconds), "frames": w.framesWritten])
        }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard !stopping, sb.isValid else { return }
        switch type {
        case .screen:
            guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
                  let raw = attachments.first?[.status] as? Int,
                  let status = SCFrameStatus(rawValue: raw), status == .complete else { return }
            writer?.appendVideo(sb)
        default:
            writer?.appendAudio(sb)
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        emit(["event": "warning", "message": "Capture stopped: \(describe(error))"])
        DispatchQueue.main.async { self.stop() }
    }

    // MARK: Synthetic source (testing)

    private var synthTimer: Timer?
    private var synthFrame = 0
    private var synthFormat: CMVideoFormatDescription?

    @MainActor private func startSynthetic() throws {
        width = 1920
        height = 1200
        writer = try MovieWriter(url: videoURL, width: width, height: height, fps: options.fps, audio: false)
        let c = CursorRecorder(bounds: { CGRect(x: 0, y: 0, width: 1, height: 1) })
        cursor = c
        let interval = 1.0 / Double(options.fps)
        synthTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in self?.synthTick() }
        RunLoop.main.add(synthTimer!, forMode: .common)
        announceStarted(microphone: false)
    }

    private func synthTick() {
        guard !stopping, let buffer = makeSyntheticPixelBuffer(frame: synthFrame) else { return }
        let now = CACurrentMediaTime()
        let pts = CMTime(seconds: now, preferredTimescale: 1_000_000)
        if synthFormat == nil {
            CMVideoFormatDescriptionCreateForImageBuffer(allocator: nil, imageBuffer: buffer, formatDescriptionOut: &synthFormat)
        }
        guard let format = synthFormat else { return }
        var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: CMTimeScale(options.fps)), presentationTimeStamp: pts, decodeTimeStamp: .invalid)
        var sb: CMSampleBuffer?
        CMSampleBufferCreateReadyWithImageBuffer(allocator: nil, imageBuffer: buffer, formatDescription: format, sampleTiming: &timing, sampleBufferOut: &sb)
        if let sb { writer?.appendVideo(sb) }
        // Scripted cursor: a slow figure-eight with a click every 2 seconds.
        let t = Double(synthFrame) / Double(options.fps)
        let x = 0.5 + 0.35 * sin(t * 0.9)
        let y = 0.5 + 0.3 * sin(t * 1.8)
        let click = synthFrame > 0 && synthFrame % (options.fps * 2) == 0
        cursor?.inject(t: now, x: x, y: y, click: click)
        synthFrame += 1
    }

    private func makeSyntheticPixelBuffer(frame: Int) -> CVPixelBuffer? {
        var pb: CVPixelBuffer?
        let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [:]]
        CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pb)
        guard let pb else { return nil }
        CVPixelBufferLockBaseAddress(pb, [])
        defer { CVPixelBufferUnlockBaseAddress(pb, []) }
        guard let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: width, height: height, bitsPerComponent: 8,
                                  bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else { return nil }
        let w = CGFloat(width), h = CGFloat(height)
        ctx.setFillColor(CGColor(red: 0.96, green: 0.97, blue: 0.99, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.setFillColor(CGColor(red: 0.16, green: 0.18, blue: 0.24, alpha: 1))
        ctx.fill(CGRect(x: 0, y: h - 72, width: w, height: 72))
        ctx.setFillColor(CGColor(red: 0.9, green: 0.92, blue: 0.96, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: 280, height: h - 72))
        let t = CGFloat(frame) / CGFloat(options.fps)
        ctx.setFillColor(CGColor(red: 0.36, green: 0.49, blue: 0.98, alpha: 1))
        ctx.fill(CGRect(x: 320 + (w - 760) * (0.5 + 0.5 * sin(t)), y: h * 0.45, width: 400, height: 240))
        // Frame counter blocks make each frame visually distinct.
        for bit in 0..<16 {
            let on = (frame >> bit) & 1 == 1
            ctx.setFillColor(on ? CGColor(red: 0.1, green: 0.1, blue: 0.1, alpha: 1) : CGColor(red: 1, green: 1, blue: 1, alpha: 1))
            ctx.fill(CGRect(x: 320 + CGFloat(bit) * 28, y: 40, width: 24, height: 24))
        }
        return pb
    }

    // MARK: Stop

    func stop() {
        guard !stopping else { return }
        stopping = true
        progressTimer?.invalidate()
        synthTimer?.invalidate()
        cursor?.stop()
        let finalize = {
            let end = CMTime(seconds: CACurrentMediaTime(), preferredTimescale: 1_000_000)
            guard let writer = self.writer else { fail("Recording never started.", code: "capture-failed") }
            writer.finish(end: end) { error in
                if let error { fail("Could not finalize the recording: \(self.describe(error))", code: "write-failed") }
                let origin = writer.firstPTS?.seconds ?? 0
                let duration = max(0, writer.lastPTS.seconds - origin)
                do {
                    try self.cursor?.write(to: self.cursorURL, origin: origin, duration: duration)
                } catch {
                    emit(["event": "warning", "message": "Cursor data could not be saved: \(self.describe(error))"])
                }
                emit([
                    "event": "stopped",
                    "video": self.videoURL.path,
                    "cursor": self.cursorURL.path,
                    "duration": duration,
                    "width": self.width,
                    "height": self.height,
                    "frames": writer.framesWritten,
                    "dropped": writer.framesDropped,
                ])
                exit(0)
            }
        }
        if let s = stream {
            s.stopCapture { _ in finalize() }
        } else {
            finalize()
        }
    }
}

// MARK: - Commands

func listSources() async {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        let displays = content.displays.map { d -> [String: Any] in
            let b = CGDisplayBounds(d.displayID)
            return ["id": d.displayID, "width": d.width, "height": d.height, "x": b.minX, "y": b.minY,
                    "main": d.displayID == CGMainDisplayID()]
        }
        let windows = content.windows.compactMap { w -> [String: Any]? in
            guard w.isOnScreen, w.windowLayer == 0, w.frame.width >= 120, w.frame.height >= 80,
                  let app = w.owningApplication, app.processID != getpid() else { return nil }
            let title = w.title ?? ""
            return ["id": w.windowID, "title": title, "app": app.applicationName, "bundleId": app.bundleIdentifier,
                    "pid": app.processID, "width": w.frame.width, "height": w.frame.height]
        }
        emit(["event": "sources", "displays": displays, "windows": windows])
        exit(0)
    } catch {
        let ns = error as NSError
        let denied = ns.domain == SCStreamErrorDomain && ns.code == SCStreamError.userDeclined.rawValue
        fail(ns.localizedDescription, code: denied ? "permission-denied" : "list-failed")
    }
}

let options = Options.parse(CommandLine.arguments)

switch options.command {
case "permission":
    emit(["event": "permission", "screen": CGPreflightScreenCaptureAccess()])
    exit(0)
case "list":
    Task { await listSources() }
    RunLoop.main.run()
case "record":
    guard !options.outDir.isEmpty else { fail("--out-dir is required", code: "usage") }
    let app = NSApplication.shared
    app.setActivationPolicy(.prohibited)
    let session = RecordingSession(options: options)

    signal(SIGINT, SIG_IGN)
    signal(SIGTERM, SIG_IGN)
    let sigint = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    let sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    sigint.setEventHandler { session.stop() }
    sigterm.setEventHandler { session.stop() }
    sigint.resume()
    sigterm.resume()

    // Control channel: "stop" on stdin, or stdin closing because the parent went away.
    Thread.detachNewThread {
        while let line = readLine() {
            if line.trimmingCharacters(in: .whitespaces) == "stop" { break }
        }
        DispatchQueue.main.async { session.stop() }
    }
    Task { await session.start() }
    app.run()
default:
    fail("Usage: FrameFlowCapture permission | list | record --out-dir DIR [--display ID | --window ID]", code: "usage")
}
