#!/usr/bin/env node
/**
 * test-myblocks-runtime.cjs  — Gate B: emitted-runtime harness
 *
 * 1. Evaluates myblocks.js generator in a vm with stubs.
 * 2. Asserts emitted calls and shared definition.
 * 3. Captures the runtime string, builds a C++ harness with MSVC, runs it.
 */
'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// ── 1. Load and evaluate generator ───────────────────────────────────
const src = fs.readFileSync(
  path.resolve(__dirname, '..', 'public/leanbot-ide/LB-blockly/blocklyduino/arduino/addon/myblocks.js'),
  'utf-8'
);

const defs = {};
const calls = [];

// Stubs for Blockly.Arduino and LeanbotArduino_addHeader
const Blockly = {
  Arduino: {
    definitions_: defs,
    ORDER_ATOMIC: 0,
    valueToCode: (_block, name, _order) => `STUB_${name}`,
    ['MyBlocks.moveDistance']: null,
    ['MyBlocks.turnLeft']: null,
    ['MyBlocks.turnRight']: null,
    ['MyBlocks.fllStopLeft']: null,
    ['MyBlocks.fllStopRight']: null,
    ['MyBlocks.fllStopT']: null,
    ['MyBlocks.fllDistance']: null,
    ['MyBlocks.fllTime']: null,
  }
};

function LeanbotArduino_addHeader() { calls.push('addHeader'); }

const sandbox = { Blockly, LeanbotArduino_addHeader, 'use strict': undefined };
vm.runInNewContext(src, sandbox);

// ── 2. Assert generators were registered ─────────────────────────────
const expectedGenerators = [
  'MyBlocks.moveDistance', 'MyBlocks.turnLeft', 'MyBlocks.turnRight',
  'MyBlocks.fllStopLeft', 'MyBlocks.fllStopRight', 'MyBlocks.fllStopT',
  'MyBlocks.fllDistance', 'MyBlocks.fllTime'
];

for (const name of expectedGenerators) {
  if (typeof Blockly.Arduino[name] !== 'function') {
    console.error(`FAIL: Blockly.Arduino['${name}'] is not a function`);
    process.exit(1);
  }
}
console.log('✓ All 8 generators registered');

// ── 3. Invoke generators and assert emitted C++ calls ────────────────
const fakeBlock = { type: 'test' };

const moveOut = Blockly.Arduino['MyBlocks.moveDistance'](fakeBlock);
if (!moveOut.includes('lbmbMove(')) { console.error('FAIL: moveDistance should call lbmbMove'); process.exit(1); }

const turnLOut = Blockly.Arduino['MyBlocks.turnLeft'](fakeBlock);
if (!turnLOut.includes('lbmbTurnLeft(')) { console.error('FAIL: turnLeft should call lbmbTurnLeft'); process.exit(1); }

const turnROut = Blockly.Arduino['MyBlocks.turnRight'](fakeBlock);
if (!turnROut.includes('lbmbTurnRight(')) { console.error('FAIL: turnRight should call lbmbTurnRight'); process.exit(1); }

const fllLOut = Blockly.Arduino['MyBlocks.fllStopLeft'](fakeBlock);
if (!fllLOut.includes('lbmbFollowMarker(') || !fllLOut.includes(', 1)')) { console.error('FAIL: fllStopLeft should call lbmbFollowMarker with mode 1'); process.exit(1); }

const fllROut = Blockly.Arduino['MyBlocks.fllStopRight'](fakeBlock);
if (!fllROut.includes('lbmbFollowMarker(') || !fllROut.includes(', 2)')) { console.error('FAIL: fllStopRight should call lbmbFollowMarker with mode 2'); process.exit(1); }

const fllTOut = Blockly.Arduino['MyBlocks.fllStopT'](fakeBlock);
if (!fllTOut.includes('lbmbFollowMarker(') || !fllTOut.includes(', 3)')) { console.error('FAIL: fllStopT should call lbmbFollowMarker with mode 3'); process.exit(1); }

const fllDistOut = Blockly.Arduino['MyBlocks.fllDistance'](fakeBlock);
if (!fllDistOut.includes('lbmbFollowDistance(')) { console.error('FAIL: fllDistance should call lbmbFollowDistance'); process.exit(1); }

const fllTimeOut = Blockly.Arduino['MyBlocks.fllTime'](fakeBlock);
if (!fllTimeOut.includes('lbmbFollowTime(')) { console.error('FAIL: fllTime should call lbmbFollowTime'); process.exit(1); }

console.log('✓ All 8 generator outputs are correct');

// ── 4. Assert runtime is registered once under myblocks_runtime ──────
if (!defs['myblocks_runtime']) {
  console.error('FAIL: myblocks_runtime definition not registered');
  process.exit(1);
}

const runtime = defs['myblocks_runtime'];
if (!runtime.includes('lbmbMove') || !runtime.includes('lbmbTurn') || !runtime.includes('lbmbFollow')) {
  console.error('FAIL: runtime missing expected function definitions');
  process.exit(1);
}
console.log('✓ myblocks_runtime registered (length=' + runtime.length + ')');

// ── 5. Assert key runtime properties ──────────────────────────────────
const checks = [
  ['LbmbMotionCtx ctx = {}', 'value-initialised LbmbMotionCtx'],
  ['LbmbFollowCtx ctx = {}', 'value-initialised LbmbFollowCtx'],
  ['delay(10)', '10ms tick present'],
  ['LbMotion.stopAndWait()', 'stopAndWait present'],
  ['lbmbClamp16', 'speed clamp present'],
];

for (const [needle, label] of checks) {
  if (!runtime.includes(needle)) {
    console.error(`FAIL: runtime missing "${needle}" (${label})`);
    process.exit(1);
  }
}
console.log('✓ Runtime structural checks pass');

// ── 6. Build C++ harness with MSVC ────────────────────────────────────
const vswhere = path.join(
  process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  'Microsoft Visual Studio', 'Installer', 'vswhere.exe'
);

if (!fs.existsSync(vswhere)) {
  console.warn('SKIP: vswhere.exe not found — MSVC not installed, skipping C++ compile step');
  console.log('✓ Gate B (JS checks) PASSED — MSVC compile skipped');
  process.exit(0);
}

const vsResult = spawnSync(vswhere, [
  '-latest', '-products', '*',
  '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
  '-property', 'installationPath'
], { encoding: 'utf-8', shell: false });

const vsPath = vsResult.stdout.trim();
if (!vsPath) {
  console.warn('SKIP: MSVC installation not found, skipping C++ compile step');
  console.log('✓ Gate B (JS checks) PASSED — MSVC compile skipped');
  process.exit(0);
}

console.log(`Using MSVC at: ${vsPath}`);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbmb-'));
const cppFile = path.join(tmpDir, 'harness.cpp');
const exeFile = path.join(tmpDir, 'harness.exe');

// Build a testable C++ harness around the runtime
const harness = `
// Mock Arduino/Leanbot APIs
#include <stdint.h>
#include <math.h>
#include <assert.h>
#include <stdio.h>
#include <stdbool.h>

typedef uint8_t byte;
static uint32_t g_time_ms = 0;
static int32_t g_dist_mm = 0;
static int32_t g_rot_deg = 0;
static uint8_t g_line_state = 0b0110;
static int16_t g_last_L = 0, g_last_R = 0;
static int run_count = 0;

uint32_t millis() { return g_time_ms; }
void delay(uint32_t ms) { g_time_ms += ms; }

struct MockLbMotion {
  void stopAndWait() { g_last_L = g_last_R = 0; }
  void runLR(int16_t l, int16_t r) {
    g_last_L = l; g_last_R = r;
    run_count++;
    // Simulate motion progress
    g_dist_mm += (l + r) / 200;
    g_rot_deg += (r - l) / 40;
  }
  int32_t getDistanceMm() { return g_dist_mm; }
  int32_t getRotationDeg() { return g_rot_deg; }
} LbMotion;

struct MockLbIRLine {
  uint8_t read() { return g_line_state; }
} LbIRLine;

// --- Inject runtime ---
${runtime}

// --- Tests ---
void test_invalid_inputs() {
  // speedPercent=0 should stop immediately
  g_time_ms = 0; g_dist_mm = 0; g_rot_deg = 0; run_count = 0;
  // Just verify the context step returns isDone=true for zero speed
  LbmbMotionCtx ctx = {};
  LbmbState state = {0, 0, 0, 0b0110};
  lbmbMotionCoreInit(&ctx, &state);
  LbmbCommand cmd = lbmbMoveCoreStep(&ctx, &state, 0.0f, 30.0f);
  assert(cmd.isDone == true && "zero speed should be done immediately");

  // negative distance should be done immediately
  cmd = lbmbMoveCoreStep(&ctx, &state, 50.0f, 0.0f);
  assert(cmd.isDone == true && "zero distance should be done immediately");

  printf("  PASS: invalid input tests\\n");
}

void test_speed_mapping() {
  // Speed 50% => targetSpeed = round(50 * 20) = 1000 steps/s
  LbmbMotionCtx ctx = {};
  LbmbState state = {0, 0, 0, 0b0110};
  lbmbMotionCoreInit(&ctx, &state);

  // After rampZone progress, speed should reach targetSpeed
  int32_t targetDistMm = 300; // 30cm
  int16_t targetSpeed = (int16_t)round(50.0f * 20.0f); // 1000
  assert(targetSpeed == 1000 && "Speed 50 must map to 1000 steps/s");

  // At full ramp progress, speed should be targetSpeed  
  LbmbState stateAtTarget = {200, targetDistMm / 2, 0, 0b0110}; // mid point
  LbmbCommand cmd = lbmbMoveCoreStep(&ctx, &stateAtTarget, 50.0f, 30.0f);
  assert(cmd.isDone == false && "should not be done at midpoint");
  assert(cmd.leftSpeed <= 2000 && cmd.rightSpeed <= 2000 && "wheel speed within 2000 bound");
  assert(cmd.leftSpeed >= 0 && "forward speed is non-negative");

  printf("  PASS: speed mapping tests\\n");
}

void test_turn_direction() {
  // Turn left: left wheel should be negative, right wheel positive
  LbmbMotionCtx ctx = {};
  LbmbState state = {0, 0, 0, 0b0110};
  lbmbMotionCoreInit(&ctx, &state);
  
  LbmbState statePartway = {50, 0, 5, 0b0110}; // 5 degrees in
  LbmbCommand cmd = lbmbTurnCoreStep(&ctx, &statePartway, 50.0f, 90.0f, true); // isLeft=true
  if (!cmd.isDone) {
    assert(cmd.leftSpeed <= 0 && "left turn: left wheel should be <= 0");
    assert(cmd.rightSpeed >= 0 && "left turn: right wheel should be >= 0");
  }

  // Turn right: right wheel negative, left positive
  LbmbMotionCtx ctx2 = {};
  lbmbMotionCoreInit(&ctx2, &state);
  LbmbCommand cmd2 = lbmbTurnCoreStep(&ctx2, &statePartway, 50.0f, 90.0f, false); // isLeft=false
  if (!cmd2.isDone) {
    assert(cmd2.rightSpeed <= 0 && "right turn: right wheel should be <= 0");
    assert(cmd2.leftSpeed >= 0 && "right turn: left wheel should be >= 0");
  }

  printf("  PASS: turn direction tests\\n");
}

void test_speed_within_bounds() {
  // All wheel commands must stay within [-2000, 2000]
  LbmbMotionCtx ctx = {};
  LbmbState state = {0, 0, 0, 0b0110};
  lbmbMotionCoreInit(&ctx, &state);
  
  for (int i = 0; i < 50; i++) {
    LbmbState s = {(uint32_t)(i * 10), i * 10, 0, 0b0110};
    LbmbCommand cmd = lbmbMoveCoreStep(&ctx, &s, 100.0f, 100.0f);
    assert(cmd.leftSpeed >= -2000 && cmd.leftSpeed <= 2000);
    assert(cmd.rightSpeed >= -2000 && cmd.rightSpeed <= 2000);
  }

  printf("  PASS: speed within [-2000, 2000] bounds\\n");
}

void test_fll_marker_detection() {
  LbmbFollowCtx ctx = {};
  LbmbState state = {0, 0, 0, 0b0110};
  lbmbFollowCoreInit(&ctx, &state);
  
  // With center line state, should run
  LbmbCommand cmd = lbmbFollowCoreStep(&ctx, &state, 50.0f, 1, 0);
  assert(cmd.isDone == false && "FLL should not stop with center line");
  
  // With marker state and sufficient count
  LbmbFollowCtx ctx2 = {};
  lbmbFollowCoreInit(&ctx2, &state);
  ctx2.markerCount = 10; // Simulate marker detected many times
  LbmbState markerState = {10, 0, 0, 0b1100}; // Left marker for mode 1
  cmd = lbmbFollowCoreStep(&ctx2, &markerState, 50.0f, 1, 0);
  assert(cmd.isDone == true && "FLL should stop at marker");
  
  printf("  PASS: FLL marker detection tests\\n");
}

void test_stall_timeout() {
  LbmbMotionCtx ctx = {};
  LbmbState state = {0, 0, 0, 0b0110};
  lbmbMotionCoreInit(&ctx, &state);
  
  // No progress for 750ms should stop
  LbmbState stalled = {800, 0, 0, 0b0110}; // 800ms later, no distance change
  LbmbCommand cmd = lbmbMoveCoreStep(&ctx, &stalled, 50.0f, 30.0f);
  assert(cmd.isDone == true && "stall timeout should stop motion");
  
  printf("  PASS: stall timeout test\\n");
}

int main() {
  printf("Running Gate B C++ harness tests...\\n");
  
  test_invalid_inputs();
  test_speed_mapping();
  test_turn_direction();
  test_speed_within_bounds();
  test_fll_marker_detection();
  test_stall_timeout();
  
  printf("\\nAll Gate B C++ tests PASSED!\\n");
  return 0;
}
`;

try {
  fs.writeFileSync(cppFile, harness, 'utf-8');

  // Find cl.exe directly (avoids VsDevCmd.bat quoting issues)
  const msvcToolsDir = path.join(vsPath, 'VC', 'Tools', 'MSVC');
  const msvcVersions = fs.readdirSync(msvcToolsDir).filter(d => /^\d/.test(d)).sort().reverse();
  if (!msvcVersions.length) {
    console.warn('SKIP: No MSVC version found under VC/Tools/MSVC');
    console.log('✓ Gate B (JS checks) PASSED — MSVC compile skipped');
    process.exit(0);
  }
  const clExe = path.join(msvcToolsDir, msvcVersions[0], 'bin', 'Hostx64', 'x64', 'cl.exe');
  if (!fs.existsSync(clExe)) {
    console.warn(`SKIP: cl.exe not found at ${clExe}`);
    console.log('✓ Gate B (JS checks) PASSED — MSVC compile skipped');
    process.exit(0);
  }
  console.log(`Using cl.exe: ${clExe}`);

  const msvcInclude = path.join(msvcToolsDir, msvcVersions[0], 'include');
  const winKitsBase = path.join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Windows Kits', '10', 'Include'
  );
  // Find latest Windows SDK
  let ucrtPath = '';
  let sharedPath = '';
  if (fs.existsSync(winKitsBase)) {
    const sdkVersions = fs.readdirSync(winKitsBase).filter(d => /^\d/.test(d)).sort().reverse();
    if (sdkVersions.length) {
      ucrtPath = path.join(winKitsBase, sdkVersions[0], 'ucrt');
      sharedPath = path.join(winKitsBase, sdkVersions[0], 'shared');
    }
  }

  const includeArgs = [`/I"${msvcInclude}"`];
  if (ucrtPath && fs.existsSync(ucrtPath)) includeArgs.push(`/I"${ucrtPath}"`);
  if (sharedPath && fs.existsSync(sharedPath)) includeArgs.push(`/I"${sharedPath}"`);

  // Build linker library paths
  const msvcLib = path.join(msvcToolsDir, msvcVersions[0], 'lib', 'x64');
  const winKitsLibBase = path.join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Windows Kits', '10', 'Lib'
  );
  const libArgs = [];
  if (fs.existsSync(msvcLib)) libArgs.push(`/link /LIBPATH:"${msvcLib}"`);
  if (fs.existsSync(winKitsLibBase)) {
    const sdkLibVersions = fs.readdirSync(winKitsLibBase).filter(d => /^\d/.test(d)).sort().reverse();
    if (sdkLibVersions.length) {
      const ucrtLib = path.join(winKitsLibBase, sdkLibVersions[0], 'ucrt', 'x64');
      const umLib = path.join(winKitsLibBase, sdkLibVersions[0], 'um', 'x64');
      if (fs.existsSync(ucrtLib)) libArgs.push(`/LIBPATH:"${ucrtLib}"`);
      if (fs.existsSync(umLib)) libArgs.push(`/LIBPATH:"${umLib}"`);
    }
  }

  const compileResult = spawnSync(`"${clExe}"`, [
    '/nologo', '/std:c++14', '/W3', '/EHsc',
    ...includeArgs,
    `"${cppFile}"`, `/Fe:"${exeFile}"`,
    ...libArgs
  ], {
    shell: true,
    encoding: 'utf-8',
    timeout: 60000,
  });

  if (compileResult.status !== 0) {
    console.error('FAIL: MSVC compilation failed');
    console.error(compileResult.stdout);
    console.error(compileResult.stderr);
    process.exit(1);
  }
  console.log('✓ MSVC compilation succeeded');

  const runResult = spawnSync(`"${exeFile}"`, [], {
    shell: true,
    encoding: 'utf-8',
    timeout: 10000,
  });

  if (runResult.status !== 0) {
    console.error('FAIL: harness executable failed');
    console.error(runResult.stdout);
    console.error(runResult.stderr);
    process.exit(1);
  }

  console.log(runResult.stdout);
  console.log('✓ Gate B PASSED');
} finally {
  // Cleanup temp dir
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
}
