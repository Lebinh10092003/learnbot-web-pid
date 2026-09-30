# Student Dual Editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a real Blockly/Monaco Student IDE whose two editors round-trip through a shared Leanbot IR without silent source loss and whose Run command can compile and upload through a production Arduino/Web Serial pipeline.

**Architecture:** A central versioned project reducer coordinates serialized Blockly state, C++ source, recursive IR, synchronization baselines, and transactional conversion candidates. A tokenizer/parser creates structured C++ nodes before semantic pattern matching; Blockly and C++ are adapters around the same IR. Compile is served by an abortable Arduino CLI endpoint and upload uses a verified STK500v1 state machine.

**Tech Stack:** React 18, TypeScript, Vite, Google Blockly, Monaco Editor, Radix/shadcn-style primitives, Vitest, Playwright, Node/Arduino CLI, Web Serial/STK500v1.

---

## Chunk 1: Conversion core

### Task 1: Test harness and recursive IR

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/transpiler/ir/types.ts`
- Create: `src/transpiler/ir/normalize.ts`
- Create: `src/transpiler/ir/normalize.test.ts`

- [ ] Install Vitest, jsdom, React Testing Library, and jest-dom; add test/coverage scripts and configure Node by default with jsdom for `*.tsx` component tests.
- [ ] Write failing tests for normalization of recursive statements/expressions, source-span removal, units, raw nodes, comments, globals, setup/loop, and functions.
- [ ] Run `npm test -- --run src/transpiler/ir/normalize.test.ts`; expect missing-module failure.
- [ ] Implement the complete IR union and normalization helper.
- [ ] Re-run the test and expect PASS.

### Task 2: Tokenizer and structural C++ parser

**Files:**
- Create: `src/transpiler/cppParser/tokenizer.ts`
- Create: `src/transpiler/cppParser/parser.ts`
- Create: `src/transpiler/cppParser/parser.test.ts`

- [ ] Write failing tests for identifiers, literals, comments, operators, preprocessor lines, balanced groups, functions, declarations, calls, nested if/else, for/while/do, returns, exact source spans, and malformed/unbalanced input.
- [ ] Run the focused parser test and verify failures are due to missing parser behavior.
- [ ] Implement tokenization and recursive structural parsing without a regex-driven conversion engine.
- [ ] Re-run the focused test and expect PASS.

### Task 3: C++ to IR semantic recognition

**Files:**
- Create: `src/transpiler/capabilities.ts`
- Create: `src/transpiler/cppToIr.ts`
- Create: `src/transpiler/cppToIr.test.ts`

- [ ] Write failing tests for mission, motion pattern folding, wheels/RPM, stop, distance/rotation, variables, arithmetic/boolean/comparison, random/constrain, sensors/touch, RGB+show, gripper, sound+delay, if/else, canonical repeat for, while/until/forever, functions/parameters/return, comments, globals/includes, units, native/raw/unsupported diagnostics, safe partial conversion, and malformed whole-file raw preservation.
- [ ] Run the focused tests and verify RED.
- [ ] Implement capability classification and semantic folding while retaining exact raw text/order/scope.
- [ ] Re-run the focused test and expect PASS.

### Task 4: IR to readable C++ and semantic round trips

**Files:**
- Create: `src/transpiler/irToCpp.ts`
- Create: `src/transpiler/roundTrip.test.ts`
- Create: `src/transpiler/index.ts`

- [ ] Write failing generator tests for all native statement/expression variants, formatting, setup/loop placement, comments, globals, functions, and verbatim raw nodes.
- [ ] Write failing semantic round-trip tests for acceptance cases 1–4 and every capability classification.
- [ ] Run focused tests and verify RED.
- [ ] Implement readable generation and public conversion exports.
- [ ] Re-run all conversion tests and expect PASS.

## Chunk 2: Blockly, Monaco, and project state

### Task 5: Real Blockly blocks and adapters

**Files:**
- Create: `src/blockly/blocks/leanbotBlocks.ts`
- Create: `src/blockly/toolbox/toolbox.ts`
- Create: `src/blockly/serialization/adapters.ts`
- Create: `src/blockly/serialization/adapters.test.ts`
- Create: `src/editors/BlocklyEditor.tsx`

- [ ] Install Blockly.
- [ ] Write failing adapter tests for every native block category, nested control flow, variables/functions, comments, Raw C++, locked whole-file raw, workspace serialization, and IR equivalence.
- [ ] Run focused tests and verify RED.
- [ ] Define Leanbot blocks/toolbox and implement IR ⇄ Blockly workspace adapters.
- [ ] Re-run adapter tests and expect PASS.
- [ ] Inject a real Blockly workspace and expose typed undo/redo/zoom/center commands.

### Task 6: Versioned persistence

**Files:**
- Create: `src/project/projectPersistence.ts`
- Create: `src/project/projectPersistence.test.ts`

- [ ] Write failing tests for versioned save/load, migrations, recovery-key behavior, corrupt/future payloads, quota failures, dirty retention, debounced writes, Ctrl+S flush, and pagehide/visibility flush.
- [ ] Run focused tests and verify RED.
- [ ] Implement dependency-injected storage/timers plus browser lifecycle binding.
- [ ] Re-run persistence tests and expect PASS.

### Task 7: Transactional project store and conflict handling

**Files:**
- Create: `src/project/projectStore.ts`
- Create: `src/project/projectStore.test.ts`

- [ ] Write failing reducer tests for independent revisions/hashes, blocks-newer, cpp-newer, synced, unsupported, both-edited conflict, conversion candidates, accept/cancel/rollback, use Blocks, use C++, compare, partial conversion, byte-exact C++ preservation, and freshest-source Run selection.
- [ ] Run focused tests and verify RED.
- [ ] Implement reducer/actions and deterministic hashing with no live-state mutation before candidate acceptance.
- [ ] Re-run store tests and expect PASS.

### Task 8: Real Monaco editor

**Files:**
- Create: `src/editors/CppEditor.tsx`
- Create: `src/editors/leanbotLanguage.ts`
- Create: `src/editors/leanbotLanguage.test.ts`

- [ ] Install Monaco and its React wrapper.
- [ ] Write failing tests for the complete Leanbot completion catalogue and parser diagnostic-to-marker line mapping.
- [ ] Run focused tests and verify RED.
- [ ] Implement C++ Monaco configuration, completions, diagnostics, Ctrl+S/Ctrl+/, and typed undo/redo commands.
- [ ] Re-run language tests and expect PASS.

## Chunk 3: Student UI

### Task 9: Accessible shadcn-style primitives

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/tabs.tsx`
- Create: `src/components/ui/tooltip.tsx`
- Create: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/alert-dialog.tsx`
- Create: `src/components/ui/toast.tsx`
- Create: `src/components/ui/resizable.tsx`
- Create: `src/components/ui/command.tsx`
- Create: `src/components/ui/ui.test.tsx`

- [ ] Install the required Radix primitives.
- [ ] Write component behavior/a11y tests for focus, keyboard close, labels, selected state, and toast live regions.
- [ ] Run UI tests and verify RED.
- [ ] Implement small local shadcn-style wrappers with visible focus and semantic state.
- [ ] Re-run UI tests and expect PASS.

### Task 10: Student shell, dialogs, and active-editor commands

**Files:**
- Create: `src/student/StudentIDE.tsx`
- Create: `src/student/Toolbar.tsx`
- Create: `src/student/DeviceStatus.tsx`
- Create: `src/student/ConversionDialog.tsx`
- Create: `src/student/ConflictDialog.tsx`
- Create: `src/student/StudentIDE.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] Write failing UI tests for Blocks/C++ switching, no-reset state, unsupported choices, conflict choices/comparison, autosave warning, active-editor undo/redo, Blockly-only zoom controls, Connect, Run, Stop, and student-only information.
- [ ] Run focused tests and verify RED.
- [ ] Build the compact light 1366×768 shell and wire all actions to the store/editor handles.
- [ ] Re-run UI tests and expect PASS.

## Chunk 4: Production Run pipeline

### Task 11: Runnable compiler endpoint and client

**Files:**
- Create: `server/index.ts`
- Create: `server/compile.ts`
- Create: `server/compile.test.ts`
- Create: `src/leanbot/compile/compilerClient.ts`
- Modify: `vite.config.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

- [ ] Install minimal Node server dependencies/types and add dev/start scripts plus Vite proxy configuration.
- [ ] Write failing endpoint tests for schema validation, source/size limits, Uno FQBN, configured Leanbot library, isolated temp directories, timeout/abort, diagnostics sanitization, nonzero exit, missing CLI, and cleanup.
- [ ] Run endpoint tests and verify RED.
- [ ] Implement the endpoint and abortable browser client.
- [ ] Re-run endpoint/client tests and expect PASS.

### Task 12: Intel HEX decoder

**Files:**
- Create: `src/leanbot/upload/intelHex.ts`
- Create: `src/leanbot/upload/intelHex.test.ts`

- [ ] Write failing tests for data/EOF/extended-address records, checksum errors, overlap, sparse addresses, AVR word/page boundaries, and invalid records.
- [ ] Run focused tests and verify RED.
- [ ] Implement strict HEX decoding into paged flash data.
- [ ] Re-run tests and expect PASS.

### Task 13: Verified STK500v1 uploader

**Files:**
- Create: `src/leanbot/runController.ts`
- Create: `src/leanbot/runController.test.ts`
- Create: `src/leanbot/upload/transport.ts`
- Create: `src/leanbot/upload/stk500.ts`
- Create: `src/leanbot/upload/stk500.test.ts`
- Modify: `src/lib/serial.ts`
- Modify: `src/student/StudentIDE.tsx`

- [ ] Write failing fake-transport tests for DTR reset, sync retry limits, enter/leave program mode, address/page frames, page boundaries, timeout, cancellation, read-back mismatch, cleanup/reboot, progress, and truthful failure states.
- [ ] Run focused tests and verify RED.
- [ ] Implement abortable transport reads/writes and STK500 upload/verification.
- [ ] Re-run uploader tests and expect PASS.
- [ ] Write failing run-controller tests for freshest source → compile → HEX → verified upload, phase progress, compile/transport/verify errors, cancellation, and post-upload runtime Stop command.
- [ ] Implement the run controller and connect both mode Run paths; Stop aborts the active stage and sends the documented runtime stop command only when firmware is running.
- [ ] Re-run run-controller tests and expect PASS.

## Chunk 5: End-to-end acceptance and documentation

### Task 14: Automated browser acceptance

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/student-ide.spec.ts`
- Create: `e2e/fixtures/mockHardware.ts`
- Create: `e2e/hardware/leanbot.fixture.spec.ts`
- Modify: `src/leanbot/compile/compilerClient.ts`
- Modify: `src/leanbot/upload/transport.ts`
- Modify: `src/student/StudentIDE.tsx`
- Modify: `package.json`

- [ ] Install Playwright and add a browser-test script.
- [ ] Add dependency-injected compiler/serial adapters and a deterministic Playwright mock-hardware fixture for normal CI.
- [ ] Write CI tests for all seven acceptance flows: motion round trip, variable edit, sensor if, Raw C++, refresh restore, mocked verified Run from Blocks, and mocked verified Run from C++.
- [ ] Add real Blockly drag/drop/serialization, Monaco editing/shortcuts, diagnostics, conflict/dialog actions, and persistence recovery coverage.
- [ ] Add a separate opt-in hardware Playwright project/script that targets the real compiler endpoint and connected Leanbot; skip it unless explicit environment flags are present.
- [ ] Run the deterministic CI Playwright project and rerun until PASS.

### Task 15: Final verification and documentation

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

- [ ] Document the conversion matrix, loss-prevention behavior, compiler configuration, Arduino CLI/AVR/Leanbot prerequisites, serial support, and fixture-gated hardware test.
- [ ] Run `npm test -- --run`; expect all unit/component/server tests PASS.
- [ ] Run `npm run build`; expect TypeScript and Vite PASS.
- [ ] Run `npm run test:e2e`; expect browser acceptance PASS.
- [ ] When toolchain is installed, compile the fixture through the real endpoint.
- [ ] When a Leanbot fixture is connected, run verified upload from both Blocks and C++ and record the result without claiming unavailable hardware checks.
