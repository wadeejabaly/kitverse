// Subject lift via Vision's foreground instance mask (macOS 14+).
// usage: lift <input.jpg> <cutout.png>
import Foundation
import Vision
import CoreImage

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: lift <in> <out.png>\n".data(using: .utf8)!)
    exit(2)
}
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])

guard let ciImage = CIImage(contentsOf: inURL) else {
    FileHandle.standardError.write("cannot read \(inURL.path)\n".data(using: .utf8)!)
    exit(3)
}

let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
let request = VNGenerateForegroundInstanceMaskRequest()

do {
    try handler.perform([request])
} catch {
    FileHandle.standardError.write("vision failed: \(error)\n".data(using: .utf8)!)
    exit(4)
}

guard let observation = request.results?.first else {
    FileHandle.standardError.write("NO_SUBJECT_FOUND\n".data(using: .utf8)!)
    exit(5)
}

let instances = observation.allInstances
FileHandle.standardError.write("instances detected: \(instances.count)\n".data(using: .utf8)!)

do {
    // Keep every detected instance, do not crop — we want the full frame so the
    // downstream pad step controls final composition.
    let masked = try observation.generateMaskedImage(
        ofInstances: instances,
        from: handler,
        croppedToInstancesExtent: false
    )
    let ctx = CIContext()
    let out = CIImage(cvPixelBuffer: masked)
    try ctx.writePNGRepresentation(
        of: out,
        to: outURL,
        format: .RGBA8,
        colorSpace: CGColorSpaceCreateDeviceRGB(),
        options: [:]
    )
    print("OK \(Int(out.extent.width))x\(Int(out.extent.height))")
} catch {
    FileHandle.standardError.write("mask generation failed: \(error)\n".data(using: .utf8)!)
    exit(6)
}
