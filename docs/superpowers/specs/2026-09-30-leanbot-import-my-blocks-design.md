# LeanbotSerial IDE Import And My Blocks Design

## Summary

Replace the currently served React interface with a pinned, locally vendored copy of
`PTA-D20/LeanbotSerial-IDE`. Preserve the reference application's file tree, C++
editor, compiler integration, upload flow, serial monitor, Web Serial connection,
and same-origin `LB-blockly` iframe. Extend that Blockly application with one new
top-level category named **My Blocks** containing eight higher-level Leanbot blocks.

The generated Arduino C++ must depend only on `Leanbot.h`. PID line following,
acceleration/deceleration, marker detection, input clamping, and safety behavior are
generated into the `.ino` file only when a My Block requires them.

## Goals

- Serve the LeanbotSerial-IDE interface and behavior instead of the current React UI.
- Preserve the original Blockly editor structure and same-origin bridge APIs.
- Preserve compile, Web Serial, STK500 upload, serial-monitor, project-file, import,
  and export behavior from the reference application.
- Add eight correctly named My Blocks that generate Arduino C++.
- Expose speed as a student-friendly percentage rather than steps per second.
- Use acceleration control for motion and PID control for line following.
- Keep generated code compatible with the existing Leanbot compile server and
  official `Leanbot.h` API.
- Preserve upstream copyright and license notices and record the imported revision.

## Non-Goals

- Reimplementing LeanbotSerial-IDE or LB-blockly in React.
- Adding a second Blockly route or a separate My Blocks workspace.
- Adding PID or acceleration parameters to block inputs.
- Automatically calibrating line sensors while an FLL block is running.
- Claiming that default PID values are optimal on every physical robot and surface.
- Changing the external compiler service protocol or the STK500 protocol.

## Reference Sources

- Blockly reference: <https://ide.pythaverse.space/lbeditor/>
- Integrated IDE demo: <https://pta-d20.github.io/LeanbotSerial-IDE/>
- Integrated IDE source: <https://github.com/PTA-D20/LeanbotSerial-IDE>

The selected upstream revision is
`d1cfb92fcf696e34801eeaf5242438af05f6672c` from `PTA-D20/LeanbotSerial-IDE`.
The source record must include the repository URL, that commit hash, the 2026-09-30
import date, and a short list of local changes.

The repository has no root-level license file. On 2026-09-30 the user explicitly
confirmed authorization to copy the full repository for this project. The imported
Blockly UI identifies itself as GPL version 3, and individual files contain GPL,
BSD-3-Clause, or other bundled third-party notices. Implementation must inventory
the notices that ship in the selected revision, copy them with the vendored source,
retain file headers, and add a `THIRD_PARTY_NOTICES.md` source record. It must not
invent or replace upstream license terms.

## Architecture

### Top-Level Application

Vendor the reference application under `public/leanbot-ide/`. The Vite root page
redirects at the top browsing-context level to `/leanbot-ide/index.html`. Do not put
the imported IDE inside an additional wrapper iframe: Web Serial and file operations
must run from the same top-level application shape as the reference demo.

Vite copies the vendored directory without transforming it, retaining relative asset
paths and the legacy module layout. Existing React source may remain in the repository
for history but is no longer the default served application.

### Blockly Integration

Retain the reference `LB-blockly` directory and its iframe integration. The parent
IDE continues to use the established same-origin functions:

- `Blockly_getBlockContent()` returns workspace XML.
- `Blockly_setBlockContent(content)` restores workspace XML.
- `Blockly_getGeneratedCode()` returns generated Arduino C++.
- The Blockly change callback notifies the parent so project content is saved.

The new category, block definitions, messages, generator functions, themes, and
toolbox entries live inside the vendored `LB-blockly` source so existing `.bduino`
files remain first-class project files.

Every My Block generator invokes the pinned editor's existing
`LeanbotArduino_addHeader()` and does not register a second setup entry. That helper
already writes `#include <Leanbot.h>` under `includes_leanbot` and
`Leanbot.begin();` under `setup_leanbot`. Reusing those exact keys makes a workspace
containing only My Blocks initialize correctly while a mixed workspace still emits
each exactly once.

### Compile And Upload

Preserve the reference compile request to `https://cs.leanbot.space/v3/compile` with
FQBN `arduino:avr:uno`. Preserve the existing CH340 and FTDI Web Serial filters,
115200 baud connection, DTR reset, compiler progress, bootloader synchronization,
128-byte upload pages, verification, cancellation, and serial-monitor restart.

The compile service does not expose a Leanbot library version pin. The supported
library contract for this feature is therefore the exact API already used by the
pinned IDE and its linked API reference:

- `Leanbot.begin()`
- `LbMotion.runLR(long left, long right)` in steps/second
- `LbMotion.stopAndWait()`
- `LbMotion.getDistanceMm()` returning cumulative signed `long` millimeters
- `LbMotion.getRotationDeg()` returning cumulative signed `long` robot-heading degrees
- `LbIRLine.read()` returning a calibrated four-bit `byte`, where `1` means black and
  bits from most- to least-significant are outer-left, inner-left, inner-right,
  outer-right
- Arduino `millis()` and `delay()`

Implementation begins with a compile-contract probe containing exactly these calls.
If the configured server rejects the probe, control-runtime implementation is blocked
and the incompatibility is reported rather than guessed around. Successful probe
source and result date become a fixture in the source record.

## Delivery Phases And Gates

This design is delivered through separate, sequential implementation plans so that
each workstream has an independently verifiable result:

1. **Pinned IDE import:** vendor the exact upstream revision, redirect the root,
   preserve notices, and prove the unmodified reference smoke flows.
2. **Blockly extension:** add the category, eight schemas, serialization fixtures,
   generator calls, and helper de-duplication while initially using deterministic
   stub helper bodies.
3. **Control runtime:** replace stubs with the specified motion/PID implementation,
   run host-model and compile-contract tests, and complete browser regression checks.
4. **Hardware tuning:** execute the physical checklist and adjust only centralized
   constants. This phase requires a real Leanbot and is reported separately; it does
   not block claiming software implementation and browser verification complete.

## My Blocks User Interface

Add a top-level **My Blocks** category immediately below the existing **Leanbot**
category. It uses the same renderer and interaction patterns as the existing toolbox
and a distinct category color.

The category contains these statement blocks, in this order. Every block has both
`previousStatement` and `nextStatement` connections. Inputs are typed Blockly Number
value inputs with a `math_number` shadow, so expressions and variables remain usable.

| Order | Stable block type | Label | Inputs and defaults |
|---:|---|---|---|
| 1 | `MyBlocks.moveDistance` | `Move With Speed %1 And Distance %2 Cm` | `Speed` Number `50`; `DistanceCm` Number `30.0` |
| 2 | `MyBlocks.turnLeft` | `Turn Left With Speed %1 And Angle %2 Degrees` | `Speed` Number `50`; `AngleDeg` Number `90` |
| 3 | `MyBlocks.turnRight` | `Turn Right With Speed %1 And Angle %2 Degrees` | `Speed` Number `50`; `AngleDeg` Number `90` |
| 4 | `MyBlocks.fllStopLeft` | `FLL With Speed %1 And Stop At Left Line` | `Speed` Number `50` |
| 5 | `MyBlocks.fllStopRight` | `FLL With Speed %1 And Stop At Right Line` | `Speed` Number `50` |
| 6 | `MyBlocks.fllStopT` | `FLL With Speed %1 And Stop At T Line` | `Speed` Number `50` |
| 7 | `MyBlocks.fllDistance` | `FLL With Speed %1 And Distance %2 Cm` | `Speed` Number `50`; `DistanceCm` Number `50.0` |
| 8 | `MyBlocks.fllTime` | `FLL With Speed %1 And Time %2 S` | `Speed` Number `50`; `TimeSec` Number `5.0` |

All visible English words use title case. The misspellings “distacne,” “Disctacne,”
and “angel” are corrected to “Distance” and “Angle.” Input names are shown here in
brackets only to identify editable value-input controls. The editable numbers belong
to connected `math_number` shadow blocks, not to serialized Blockly field properties
on the My Block itself.

### Input Contracts

- Move Speed: Number input `-100..100`; negative values move backward.
- Turn and FLL Speed: Number input `0..100`.
- Mapping: `100% = 2000 steps/second`, therefore `stepsPerSecond = percent * 20`.
- Distance: finite decimal centimeters in `0.1..1000.0`; generated millimeters are
  rounded to the nearest integer.
- Angle: Number input `1..3600` degrees of robot-body heading, not wheel rotation.
- Time: finite decimal seconds in `0.1..600.0`; generated milliseconds are rounded to
  the nearest unsigned long.
- Literal child values outside these bounds produce a Blockly warning. Dynamic
  expressions cannot be evaluated in the editor and are validated at runtime.
- Finite Speed and Angle values are rounded to the nearest integer with half values
  away from zero. Speed is then clamped to its permitted range. Angle, Distance, and
  Time outside their stated ranges are rejected with a safe stop rather than clamped.
- Millimeter, millisecond, and wheel commands use the same nearest-integer rule before
  conversion to `long`/`unsigned long`.
- `NaN`, infinity, conversion overflow, zero speed, or a non-positive amount performs
  `LbMotion.stopAndWait()` and returns. Negative Distance is rejected; it is never
  converted to an absolute valid distance. Only the sign of Move Speed selects travel
  direction.

## Generated C++ Design

Each generator emits one call to an exact helper interface:

```cpp
lbmbMove(float speedPercent, float distanceCm);
lbmbTurnLeft(float speedPercent, float angleDeg);
lbmbTurnRight(float speedPercent, float angleDeg);
lbmbFollowMarker(float speedPercent, byte markerMode);
lbmbFollowDistance(float speedPercent, float distanceCm);
lbmbFollowTime(float speedPercent, float timeSec);
```

Marker modes are `LBMB_MARKER_LEFT = 1`, `LBMB_MARKER_RIGHT = 2`, and
`LBMB_MARKER_T = 3`. The generator also registers required includes, constants, state types, and
helper functions in the Blockly Arduino generator's definitions table. Definition
keys are stable, so helpers are emitted at most once even when many My Blocks use
them.

Generated identifiers use a project-specific prefix to avoid collisions with user
variables and the Leanbot library. Generated code includes `Leanbot.h` only once and
does not require an additional installed library.

### Motion And Acceleration

All control loops update every `10 ms`. `100%` is exactly `2000 steps/second`.
The minimum non-zero ramp speed is the smaller of the requested target and
`200 steps/second`.

Move captures `LbMotion.getDistanceMm()` at entry. Progress is the absolute difference
from that value. The signed wheel command follows Speed, but progress and the requested
Distance remain positive. Turn captures `LbMotion.getRotationDeg()` at entry and uses
absolute heading delta, so cumulative headings need no wrap correction. Left commands
`(-speed, +speed)` and Right commands `(+speed, -speed)`.

The profile is deterministic and distance based:

- Move ramp zone: `min(100 mm, targetDistanceMm / 4)`.
- Turn ramp zone: `min(30 degrees, targetAngleDeg / 4)`.
- `rampFactor = min(1, progress/rampZone, remaining/rampZone)`.
- Command magnitude is linearly interpolated from minimum ramp speed to target by
  `rampFactor`.
- A ramp zone of zero is rejected before entering the loop.
- Endpoint tolerance is `1 mm` for Move and `1 degree` for Turn.
- Overshoot ends the loop immediately and calls `LbMotion.stopAndWait()`.

Both wheel commands are rounded to the nearest integer and clamped to
`-2000..2000`. A stall means the maximum observed progress has not increased by at
least `1 mm` or `1 degree` for `750 ms`; it stops with no retry. Target-bounded Move
and Turn do not use a speed-independent overall timeout: monotonically increasing
maximum progress must either reach the finite target or trigger the stall rule. Stall
timing uses unsigned `millis()` subtraction and always stops the robot.

### FLL PID Loop

FLL means following the line with the four Leanbot IR line sensors. Sensor calibration
is an explicit separate step using the existing `IRLine: Do Manual Calibration`
block. FLL uses the stored thresholds and does not initiate calibration itself.

The controller samples calibrated `LbIRLine.read()` every `10 ms`. It uses this
deterministic error table; unlisted non-zero patterns retain the previous valid error:

| Sensor state | Meaning | Error |
|---|---|---:|
| `0b1000` | far left | `-3` |
| `0b1100` | left | `-2` |
| `0b0100`, `0b1110` | slightly left | `-1` |
| `0b0110`, `0b1111` | centered/intersection | `0` |
| `0b0010`, `0b0111` | slightly right | `+1` |
| `0b0011` | right | `+2` |
| `0b0001` | far right | `+3` |
| `0b0000` | line lost | no new valid error |

The valid-state set is exactly `0b1000`, `0b1100`, `0b0100`, `0b1110`, `0b0110`,
`0b1111`, `0b0010`, `0b0111`, `0b0011`, and `0b0001`. Any other pattern is
ambiguous: it retains the prior error but does not reset the 750 ms line-loss timer.
Only a state in this explicit set resets that timer.

The discrete PID step uses this ordered anti-windup procedure:

```text
derivative = error - previousError
candidateIntegral = clamp(integral + error, -40, +40)
candidateCorrection = 220*error + 3*candidateIntegral + 160*derivative
candidateLeft = baseSpeed + candidateCorrection
candidateRight = baseSpeed - candidateCorrection
wouldSaturate = abs(candidateCorrection) > baseSpeed
                or candidateLeft < 0 or candidateLeft > 2000
                or candidateRight < 0 or candidateRight > 2000
if wouldSaturate and sign(candidateCorrection) == sign(error):
    acceptedIntegral = integral
else:
    acceptedIntegral = candidateIntegral
correction = clamp(220*error + 3*acceptedIntegral + 160*derivative,
                   -baseSpeed, +baseSpeed)
left = clamp(baseSpeed + correction, 0, 2000)
right = clamp(baseSpeed - correction, 0, 2000)
integral = acceptedIntegral
previousError = error
```

These sampled gains have units of steps/second per error unit, accumulated-error unit,
and error-delta unit respectively. PID state resets at entry.

Base speed starts at `minimumSpeed = min(target, 200)`. At each tick calculate an
endpoint limit. For Distance mode:

```text
rampZone = min(100 mm, targetDistanceMm / 4)
endpointFactor = clamp(remainingMm / rampZone, 0, 1)
endpointLimit = minimumSpeed + (target - minimumSpeed) * endpointFactor
```

For Time mode, substitute `rampZone = min(300 ms, targetTimeMs / 4)` and remaining
milliseconds. Marker mode has `endpointLimit = target`. The desired base is
`min(target, endpointLimit)`. The actual base slews toward desired base by at most
`12 steps/second` each 10 ms tick, both upward and downward. Thus startup acceleration
and endpoint deceleration combine deterministically, and the endpoint speed approaches
`minimumSpeed` before `stopAndWait()`. If target is below 200, minimum and target are
identical and no ramp is needed.

At entry, `previousError = 0`, `integral = 0`, `hasValidError = false`, and the
line-loss timer starts immediately. For `0b0000` or an ambiguous state, command
`(+searchSpeed, 0)` when the last valid error was positive and
`(0, +searchSpeed)` when it was negative, where `searchSpeed = min(baseSpeed, 400)`.
When `hasValidError` is false, command `(searchSpeed, searchSpeed)`. A valid state sets
`hasValidError = true` and resets the loss timer. Continuous loss or ambiguity for
`750 ms` stops and returns. Marker modes also have an overall `60000 ms` failsafe;
reaching no marker by then stops and returns.

All numeric constants are centralized in the generated definition block and are
documented as safe starting values, not universal physical tuning results.

### Marker Detection

- Left Line: `(state & 0b1100) == 0b1100` and `(state & 0b0001) == 0`.
- Right Line: `(state & 0b0011) == 0b0011` and `(state & 0b1000) == 0`.
- T Line: `state == 0b1111`.
- Three consecutive matching samples (`30 ms`) accept a marker. A non-matching sample
  resets the counter to zero. Starting on a marker is allowed and stops after three
  samples.
- While the counter is `1` or `2`, freeze PID integral/derivative and command both
  wheels at the current base speed; this prevents marker width from steering the
  robot before acceptance.
- Acceptance calls `LbMotion.stopAndWait()` immediately. “Controlled stop” refers to
  the Leanbot library's blocking deceleration; no unverified custom braking distance
  is added for an endpoint that cannot be predicted.

### Distance And Time Endpoints

- FLL Distance measures absolute `LbMotion.getDistanceMm()` delta from the point at
  which the block begins and stops after the requested centimeters, with `1 mm`
  tolerance and the same maximum-progress stall rule as Move. It has no independent
  overall timeout for the same reason as target-bounded Move.
- FLL Time measures elapsed `millis()` from block entry and stops after the requested
  seconds.
- Time is limited to `600000 ms`, far below half the unsigned 32-bit wrap interval.
  Elapsed-time comparisons tolerate `millis()` rollover by using unsigned subtraction.

## Persistence And Compatibility

My Blocks serialize through the existing Blockly XML format. Saving, exporting,
importing, and reopening `.bduino` files must preserve block type, connected value
inputs and their child shadow/block values, connections, and order. Existing
`.bduino`, XML, and `.ino` projects must continue to open without migration.

The parent editor always compiles `Blockly_getGeneratedCode()` for Blockly files and
the Monaco content for C++ files, matching the reference behavior.

## Error Handling And Safety

- Blockly range warnings identify invalid inputs before compilation.
- Runtime finite checks and clamping protect against values produced by variables or
  expressions and against conversion overflow.
- Zero or invalid movement requests stop safely without entering a control loop.
- Every control loop has a deterministic exit path: target, marker, distance, time,
  stall, overall timeout, lost-line timeout, or invalid input.
- Existing compiler, server, serial selection, reset, sync, write, verification, and
  cancellation errors remain visible in the reference IDE logs and notifications.
- Web Serial continues to require Chrome/Edge in HTTPS or localhost secure contexts.
- No automatic reconnect-and-upload occurs without the existing explicit user flow.

## Testing Strategy

### Automated Tests

- Assert the My Blocks category exists directly after Leanbot and contains exactly
  the eight specified blocks in order.
- Assert every visible label and default input value.
- Assert Move accepts negative speed while turn/FLL inputs reject negative speed.
- Assert percentage conversion and output clamps.
- Assert backward Move emits or executes backward wheel commands with positive
  distance magnitude.
- Assert Left and Right turns produce opposite wheel commands and measure robot
  heading.
- Assert Left, Right, and T marker truth tables and debounce behavior.
- Assert distance and time exit conditions, lost-line timeout, PID anti-windup, and
  acceleration boundaries.
- Assert generator helper definitions appear exactly once.
- Assert `Leanbot.h` and `Leanbot.begin();` each appear exactly once in both a
  My-Blocks-only workspace and a workspace mixing original Leanbot and My Blocks.
- Assert XML save/load round trips preserve every My Block.

Control behavior has one machine-readable source of truth,
`myblocks-control-spec.mjs`. It contains typed constants, bounds, the sensor/error
table, marker masks, ordered PID operations, ramp operations, and timeout rules as a
small declarative data structure. Two consumers are generated from it:

- a pure JavaScript evaluator used by Vitest with arrays of sensor, odometry, heading,
  and time samples;
- the C++ definitions string inserted by the Blockly generator.

No PID/ramp equation or numeric constant is manually duplicated between those
consumers. Snapshot tests assert the emitted C++ for every operation, and representative
generated sketches are compiled by the remote contract test.

The emitter also produces a pure, Arduino-independent C++ control core accepting plain
state structs and returning wheel-command structs. All target-width values use
`int32_t`, `uint32_t`, `int16_t`, and `uint16_t` from `<stdint.h>`; no calculation
depends on host `long` width. The Arduino wrapper explicitly converts `millis()` to
`uint32_t`, checks Leanbot `long` odometry values fit `int32_t`, then passes them into
the core.

An automated host harness compiles that exact emitted core as C++17 and executes the
same vector fixtures as the JavaScript evaluator, including numeric conversion,
overflow rejection, unsigned rollover, anti-windup ordering, and marker transitions.
On this Windows x86_64 project the pinned fallback compiler is Zig 0.16.0 invoked as
`zig c++`:

- source: `https://ziglang.org/download/0.16.0/zig-x86_64-windows-0.16.0.zip`
- SHA-256: `68659eb5f1e4eb1437a722f1dd889c5a322c9954607f5edcf337bc3684a75a7e`
- archive size: `97,217,739` bytes
- upstream license: MIT, retained in the extracted toolchain
- cache: `output/toolchains/zig-0.16.0/`, excluded from application assets and source
  control

The bootstrap script reuses a checksum-verified cache; otherwise it downloads to a
temporary filename, verifies size and SHA-256, and extracts only after verification.
On another platform, `CXX` must name a C++17 compiler instead of downloading the
Windows archive. Absence of a runnable harness is a test failure, not a skip. The
Arduino wrapper calls this tested core and is compile-checked by
`arduino-cli`/the configured server. Hardware wrapper behavior is separately
browser-smoked; it is not mocked and mistaken for physical verification.

Compatibility fixtures are bounded to:

- the pinned upstream default `.bduino` workspace;
- one pinned upstream Leanbot motion `.bduino` fixture;
- one new fixture containing all eight My Blocks;
- one plain `.ino` fixture from `TemplateSourceCode/BasicMotion.ino`.

Unknown block types follow upstream Blockly behavior and are outside this feature's
compatibility guarantee.

### Browser Tests

- Load the imported IDE at the root URL and verify the reference shell is visible.
- Create a `.bduino` project and open the My Blocks category.
- Place each My Block, edit its connected value inputs, and verify generated C++
  updates.
- Save, reopen, export, and import a project.
- Compile representative generated programs against the configured server.
- Exercise the Web Serial chooser and cancellation/error paths in a supported browser.

### Hardware Validation

Software tests cannot prove physical PID quality. A Leanbot hardware checklist must
cover forward/backward distance, left/right 90-degree body turns, FLL on straight and
curved lines, all marker types, battery-level variation, and repeated-run error. Tune
the centralized constants from those results without changing block contracts.

## Acceptance Criteria

- Visiting the project opens the full LeanbotSerial-IDE reference interface.
- Existing C++, Blockly, compile, upload, serial, import, and export flows remain
  operational.
- Blockly visually and behaviorally matches the imported reference, with only the
  added My Blocks category and necessary attribution changes.
- All eight My Blocks are present, correctly named, serializable, and generate valid
  Arduino C++ using `Leanbot.h`.
- Generated helpers implement input clamping, acceleration behavior, PID line
  following, debounced marker detection, and safe exits.
- Automated tests and production build pass.
- Browser smoke tests pass.
- Physical behavior is reported honestly: software completion is separate from final
  PID tuning on an actual robot.
