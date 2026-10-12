// Builds the native macOS capture helper into resources/bin/FrameFlowCapture.
// Skips rebuilding when the binary is newer than its source.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'native/macos/FrameFlowCapture.swift')
const outDir = join(root, 'resources/bin')
const output = join(outDir, 'FrameFlowCapture')
const buildDir = join(root, 'native/macos/build')

if (process.platform !== 'darwin') {
  console.log('[native] Not on macOS; skipping capture helper build.')
  process.exit(0)
}

if (existsSync(output) && statSync(output).mtimeMs > statSync(source).mtimeMs && !process.argv.includes('--force')) {
  console.log('[native] FrameFlowCapture is up to date.')
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
mkdirSync(buildDir, { recursive: true })

const archs = process.env.FRAMEFLOW_NATIVE_ARCHS?.split(',') ?? ['arm64', 'x86_64']
const slices = []
for (const arch of archs) {
  const slice = join(buildDir, `FrameFlowCapture-${arch}`)
  console.log(`[native] Compiling for ${arch}…`)
  execFileSync('xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macos14.0`, '-o', slice, source], { stdio: 'inherit' })
  slices.push(slice)
}
execFileSync('lipo', ['-create', '-output', output, ...slices], { stdio: 'inherit' })
// Ad-hoc signature so the binary runs on Apple silicon and keeps a stable identity.
execFileSync('codesign', ['--force', '--sign', '-', '--identifier', 'app.frameflow.capture', output], { stdio: 'inherit' })
console.log(`[native] Built ${output}`)
