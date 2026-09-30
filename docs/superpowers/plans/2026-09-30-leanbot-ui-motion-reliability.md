# Leanbot UI And Motion Reliability Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the imported Leanbot IDE so Compile/Upload feedback is reliable, My Blocks are blue, and the generated C++ moves, turns, and follows lines faster and more accurately without exceeding 2000 steps/s.

**Architecture:** Keep the imported IDE structure and public Blockly block contracts unchanged. Gate A extracts only the async lifecycle policy into a tiny testable module, then changes cache keys and the shared theme token; Gate B replaces only the C++ runtime string emitted by the existing My Blocks generator. Tests first exercise lifecycle outcomes and the deployed browser, then compile and execute the exact captured generated C++ against mocked Leanbot APIs.

**Tech Stack:** Vanilla JavaScript, Blockly Arduino generator, C++/Leanbot API, Vitest, MSVC host compiler, Arduino CLI, Playwright, Vite.

**Specification:** `docs/superpowers/specs/2026-09-30-leanbot-ui-motion-reliability-design.md`

---

## Chunk 1: Gate A — IDE Lifecycle, Cache, And Theme

### Task 1: Add failing UI and asset-contract tests

**Files:**
- Create: `src/leanbot/legacy-ide-ui.test.ts`
- Create later: `public/leanbot-ide/ideFlowPolicy.js`
- Inspect: `public/leanbot-ide/index.html`
- Inspect: `public/leanbot-ide/main.js`
- Inspect: `public/leanbot-ide/LB-blockly/index.html`
- Inspect: `public/leanbot-ide/LB-blockly/blocklyduino/themes/themes_categories.js`
- Inspect: `public/leanbot-ide/LB-blockly/blocklyduino/blocks/myblocks.js`

- [ ] **Step 1: Write the failing tests**

Import the not-yet-created policy module and behaviorally assert:

```ts
// @ts-expect-error The imported IDE is intentionally plain JavaScript.
import { withLockedControls, getCompileSuccessNotice, getUploadNotice } from '../../public/leanbot-ide/ideFlowPolicy.js'
await expect(withLockedControls(setEnabled, async () => { throw new Error('network') }))
  .rejects.toThrow('network')
expect(setEnabled.mock.calls).toEqual([[false], [true]])
expect(getCompileSuccessNotice('warning: x').text).toBe('Compile Successful With Warnings')
expect(getCompileSuccessNotice('ok').closeProgram).toBe(true)
expect(getUploadNotice({ success: true })).toEqual({ kind: 'success', disconnectSafe: true })
expect(getUploadNotice({ success: false, exception: 'cancelled' }).kind).toBe('cancelled')
expect(getUploadNotice({ success: false, exception: 'verify failed' }).kind).toBe('error')
```

The `@ts-expect-error` line is required because the legacy module lives outside the
typed `src` tree; `npm run build` must prove that this accommodation stays valid.

Use `readFileSync` and targeted assertions for static contracts:

```ts
expect(outerHtml).toContain('styles.css?v=20260930-2')
expect(outerHtml).toContain('main.js?v=20260930-2')
expect(outerHtml).toContain('LB-blockly/index.html?v=20260930-2')
expect(innerHtml).toContain('themes_categories.js?v=20260930-2')
expect(innerHtml).toContain('blocks/myblocks.js?v=20260930-2')
expect(innerHtml).toContain('arduino/addon/myblocks.js?v=20260930-2')
expect(theme).toMatch(/"myblocks_category"\s*:\s*\{\s*"colour"\s*:\s*"#3373CC"/)
expect(blockDefinitions.match(/style:\s*myBlocksCategoryStyle/g)).toHaveLength(8)
expect(mainSource).toContain('Compile Successful With Warnings')
expect(mainSource).toContain('Upload Successful — You Can Disconnect The USB Cable And Run The Robot.')
```

Assert that `main.js` imports and uses the policy module; assert `onCompileSucess` contains `uiHideSerialTab()` while `onCompileError` does not. Assert `LeanbotSerial.js` calls `#verifyUploadedCode()` before `upload2()` returns `{ success: true }`, so the success notice cannot precede verification.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --run src/leanbot/legacy-ide-ui.test.ts`

Expected: FAIL because the policy module does not exist and the old theme/version/message contracts remain.

### Task 2: Implement Compile/Upload lifecycle and cache versioning

**Files:**
- Create: `public/leanbot-ide/ideFlowPolicy.js`
- Modify: `public/leanbot-ide/main.js:689-865`
- Modify: `public/leanbot-ide/index.html:9,156,312`
- Modify: `public/leanbot-ide/LB-blockly/index.html:653-716`
- Modify: `public/leanbot-ide/LB-blockly/blocklyduino/themes/themes_categories.js:10`

- [ ] **Step 1: Implement the minimum lifecycle policy**

Export `withLockedControls(setEnabled, operation)`, `getCompileSuccessNotice(log)`, and `getUploadNotice(result)`. `withLockedControls` disables once, awaits the operation, and restores once in `finally`; the two classifiers return deterministic data and do not touch the DOM.

Import it from `main.js` as `./ideFlowPolicy.js?v=20260930-2` so this newly loaded
asset obeys the same release-token contract.

- [ ] **Step 2: Make Compile cleanup unconditional**

Wrap `await leanbot.Compiler.compile(sourceCode)` with `try/finally`, restoring tree, Compile/Upload, and Connect controls only in `finally`.

- [ ] **Step 3: Close PROGRAM only from the success callback**

After preserving `UploaderCompileLog.value`, select the toast using:

```js
const hasWarnings = /\bwarning:/i.test(compileMessage);
const text = hasWarnings ? 'Compile Successful With Warnings' : 'Compile Successful';
```

Show it only for compile-only mode, then call `uiHideSerialTab()`. Leave `onCompileError` open.

- [ ] **Step 4: Make Upload outcomes explicit and cleanup unconditional**

Change the success copy to:

```js
'Upload Successful — You Can Disconnect The USB Cable And Run The Robot.'
```

Have `Uploader.upload2()` return `{ success: true, verified: true }` only after
`#uploadCode()` returns from verification. Treat success without `verified: true` as
an error. Wrap `compileAndUpload2` plus `uploadFlush` in `try/finally`; keep
cancellation separate from errors; restore `isCompileAndUpload` and all controls in
`finally`.

- [ ] **Step 5: Apply one release token and one shared blue token**

Add `?v=20260930-2` to the six entry references named in the tests, and change only `myblocks_category.colour` to `#3373CC`.

- [ ] **Step 6: Run Gate A unit tests and confirm GREEN**

Run: `npm test -- --run src/leanbot/legacy-ide-ui.test.ts`

Expected: all Gate A tests pass.

- [ ] **Step 7: Do not stage the dirty imported tree**

Record `git status --short` and leave all implementation files unstaged. `public/leanbot-ide/` is currently untracked as a whole and `package.json` was already modified, so an automatic commit cannot distinguish the user's baseline from this task's changes.

### Task 3: Pass Gate A in a repeatable browser run

**Files:**
- Create: `scripts/test-legacy-ide-browser.cjs`
- Modify: `public/leanbot-ide/main.js` with a localhost-only `?test=1` hook

- [ ] **Step 1: Write the Playwright runner**

On Windows spawn `npm.cmd` with arguments
`['run','dev:web','--','--host','127.0.0.1','--port','5174','--strictPort']` and
`shell: false`; poll `http://127.0.0.1:5174/leanbot-ide/index.html?test=1` until HTTP
200 (30-second limit). Register
`page.route('https://cs.leanbot.space/v3/compile', ...)` with switchable success,
warning, and error JSON. Capture console/page errors and all local asset request
URLs.

- [ ] **Step 2: Exercise Compile states and layout**

For success and warning responses, click Compile, wait for the toast, and assert PROGRAM is hidden after the callback while its textarea retains the returned log. For an error response, assert PROGRAM stays visible and its log remains. Assert Compile/Upload/Connect controls recover after rejected fetch, My Blocks renders blue in the iframe, modified requests use `v=20260930-2`, and no blank region or console/page error appears.

When `location.hostname` is `127.0.0.1` and query `test=1` is present, `main.js`
exposes a narrow `window.__leanbotIdeTestHooks` that can replace only
`compileAndUpload2`/`uploadFlush` and invoke `runCompileUploadFlow2`. Use it to test:

- `{success:true, verified:true}` shows the disconnect-safe message and transitions
  to SERIAL after one second;
- `{success:true}` is rejected as unverified and keeps PROGRAM visible;
- cancellation uses the cancellation UI without an error toast;
- a false failure and a thrown error keep PROGRAM/log details visible;
- each outcome restores Compile, Upload, Connect, tree controls, and clears the
  in-progress flag.

- [ ] **Step 3: Guarantee teardown**

Close browser/context and terminate the Vite child in `finally`; on Windows use `taskkill /PID <pid> /T /F` only for that validated child PID.

- [ ] **Step 4: Run Gate A and stop if it fails**

Run: `node scripts/test-legacy-ide-browser.cjs`

Expected: process exits 0. Do not start Gate B until this passes.

## Chunk 2: Gate B — Exact Generated C++ Runtime

### Task 4: Add a failing emitted-runtime harness

**Files:**
- Create: `scripts/test-myblocks-runtime.cjs`
- Modify: `package.json`
- Exercise: `public/leanbot-ide/LB-blockly/blocklyduino/arduino/addon/myblocks.js`

- [ ] **Step 1: Capture the exact generator output**

In the Node script, evaluate the generator in `vm` with stubs for `Blockly.Arduino` and `LeanbotArduino_addHeader`. Invoke all eight generators with distinct stub values, assert their exact emitted calls, assert the shared definition is registered once under `myblocks_runtime`, then capture that exact runtime string.

- [ ] **Step 2: Build an executable C++ harness around that exact string**

Prepend mocks for `millis`, `delay`, `LbMotion`, `LbIRLine`, and `byte`; append a `main()` with assertions for:

- invalid/range inputs stop safely;
- Speed 50 maps to 1000 steps/s and reaches it by 200 ms;
- wheel commands remain within `[-2000,2000]`;
- forward/reverse heading correction keeps travel sign;
- a 90-degree turn with simulated coast settles within 2 degrees after at most two fine passes;
- FLL derivative filtering, saturation/anti-windup, lost-line timeout, marker debounce, distance/time braking, and stall timeout.

Locate Visual Studio using `%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`. Invoke the compiler with `spawnSync('cmd.exe', ['/d','/s','/c', 'call "<installation>\\Common7\\Tools\\VsDevCmd.bat" -no_logo && cl /nologo /std:c++14 /W4 /WX /EHsc "<harness.cpp>" /Fe:"<harness.exe>"'], {shell:false})`, run the quoted executable path directly, and always remove the temporary directory in `finally`.

- [ ] **Step 3: Register the harness**

Add:

```json
"test:myblocks": "node scripts/test-myblocks-runtime.cjs"
```

- [ ] **Step 4: Run it and confirm RED**

Run: `npm run test:myblocks`

Expected: FAIL because the existing emitted runtime uses slow `+12` slew, begins stopping only after the target angle, has the old PID derivative, and does not value-initialize contexts.

### Task 5: Replace the emitted motion controller

**Files:**
- Modify: `public/leanbot-ide/LB-blockly/blocklyduino/arduino/addon/myblocks.js:3-318`

- [ ] **Step 1: Centralize and validate controller constants**

Define named C++ constants for the 10 ms tick, 200/2000 speed bounds, `+40/-80` slew, 750 ms safety timeouts, move/turn braking, heading PD (`16/28`), and FLL PID (`220/2/60`, integral 30). Reject non-finite and out-of-contract values instead of clamping invalid user inputs.

- [ ] **Step 2: Implement responsive Move with heading hold**

Add `currentSpeed` and `previousHeadingError` to `LbmbMotionCtx`; ramp to Speed 50 in 200 ms, decelerate in `clamp(targetSpeed/25,15,80)` mm, and apply bounded heading correction while preserving forward/reverse sign.

- [ ] **Step 3: Implement predictive coarse/fine Turn**

Run the coarse pass toward `targetAngle - clamp(targetSpeed/100,5,20)`, call `stopAndWait`, re-read settled body rotation, then make at most two corrections at `min(targetSpeed,250)` and stop one degree early. Use signed odometry so both over- and under-shoot corrections work for Left and Right.

- [ ] **Step 4: Implement stable FLL control**

Keep the verified digital line-state table; filter derivative using `(3*previous + raw)/4`, cap the outer wheel at requested base speed, reduce only the inner wheel, prevent integral growth into saturation, pivot at edge state magnitude 3, require three marker samples, and apply separate distance/time braking windows.

- [ ] **Step 5: Value-initialize every wrapper context**

Use:

```cpp
LbmbMotionCtx ctx = {};
LbmbFollowCtx ctx = {};
```

so generated AVR code has no maybe-uninitialized context warning.

- [ ] **Step 6: Run the exact emitted-C++ harness and confirm GREEN**

Run: `npm run test:myblocks`

Expected: MSVC compilation succeeds with warnings treated as errors, executable exits 0, and all controller assertions pass.

## Chunk 3: Integration And Evidence

### Task 6: Verify Arduino compatibility and record hardware procedure

**Files:**
- Modify if needed: `README.md`
- Create: `docs/leanbot-hardware-calibration.md`
- Create: `scripts/compile-myblocks-remote.cjs`

- [ ] **Step 1: Run all automated tests and build**

Run each command fail-fast:

```powershell
npm test -- --run; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run test:myblocks; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/test-legacy-ide-browser.cjs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

Expected: all tests pass, C++ host harness exits 0, and Vite production build succeeds.

- [ ] **Step 2: Compile a representative generated sketch on the pinned Leanbot service**

`scripts/compile-myblocks-remote.cjs` must capture the exact generator runtime, wrap calls to Move, Left/Right Turn, marker FLL, distance FLL, and time FLL in a sketch with `#include <Leanbot.h>`, then POST the exact IDE payload to `https://cs.leanbot.space/v3/compile`. Fail unless HTTP is successful, response `hex` is non-empty, and `log` lacks `may be used uninitialized`.

Run: `node scripts/compile-myblocks-remote.cjs`

Expected: process exits 0 and prints flash/RAM compiler summary without the uninitialized-context warning. A network outage is reported as an external verification blocker, never converted into a pass.

- [ ] **Step 3: Re-run the Gate A browser runner after Gate B**

Run: `node scripts/test-legacy-ide-browser.cjs`

Expected: process exits 0 and its `finally` terminates the Vite child.

- [ ] **Step 4: Document hardware calibration without claiming unmeasured results**

Create tables with five numbered repetitions for: Move forward 30 cm, Move backward 30 cm, Turn Left 90 degrees, Turn Right 90 degrees, straight/curved FLL, and Left/Right/T marker stops, all at Speed 50. Each row records battery state, surface, elapsed time, distance/angle error, line-loss count, and marker overshoot. Include the exact setup/calibration steps and provisional thresholds from the approved specification. Leave measured cells blank and state clearly that constants remain provisional until the user runs Gate C on the physical robot.

- [ ] **Step 5: Run verification again after documentation changes**

Run the same four fail-fast commands from Step 1 plus `node scripts/compile-myblocks-remote.cjs`.

Expected: all commands exit 0.

### Task 7: Final review

- [ ] **Step 1: Review the complete diff for unrelated changes**

Run: `git status --short; git diff --check; git log --oneline -8`

Expected: no whitespace errors; task changes are listed explicitly; pre-existing unrelated working-tree files remain untouched. Do not stage or commit the dirty imported tree automatically.

- [ ] **Step 2: Request correctness and scope review**

Use `superpowers:requesting-code-review` against the approved specification. Fix High/Medium issues with a failing regression test first.

- [ ] **Step 3: Re-run the full verification suite**

Use `superpowers:verification-before-completion`; do not claim physical calibration until the real-robot table is filled.
