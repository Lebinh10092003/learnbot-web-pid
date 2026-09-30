# Student Dual Editor Design

## Outcome

Leanbot Studio becomes a single-project student IDE with two loss-aware views: real Google Blockly and real Monaco C++. A central `LeanbotProject` owns C++ source, serialized Blockly state, normalized Leanbot IR, active mode, and synchronization state. Neither editor owns a separate program.

## Chosen architecture

The implementation uses a purpose-built tokenizing parser for the supported Arduino/Leanbot subset. The tokenizer preserves source spans, comments, strings, punctuation, and nested braces; the parser builds a small C++ syntax tree before semantic pattern matching converts it to Leanbot IR. Motion patterns such as `runLR` + wait + stop collapse into one semantic statement. Valid calls without a native block become Raw C++ statements, while unsafe or structurally unsupported constructs remain in C++ and trigger a loss-prevention dialog.

The normalized flow is:

```text
Blockly workspace JSON ⇄ Blockly adapter ⇄ Leanbot IR ⇄ C++ generator/parser ⇄ Monaco source
```

## Modules

- `src/transpiler/ir`: shared program and statement types plus capability classifications.
- `src/transpiler/cppParser`: tokenizer and structure-aware parser with source ranges.
- `src/transpiler/cppToIr.ts`: semantic recognition and unsupported-region reporting.
- `src/transpiler/irToCpp.ts`: stable, readable Arduino C++ generation.
- `src/blockly`: Leanbot block definitions, toolbox, and IR/workspace adapters.
- `src/project`: central reducer/store and localStorage persistence.
- `src/editors`: Blockly and Monaco wrappers.
- `src/student`: compact light Student IDE shell and safety dialogs.
- `server/compile`: Node compiler endpoint invoking a configured Arduino CLI, AVR core, and Leanbot library in an isolated temporary build directory.
- `src/leanbot/upload`: Intel HEX decoding and an abortable STK500v1 state machine over Web Serial (sync, page write, read-back verify, reboot).

## IR contract and invariants

`LeanbotProgram` contains ordered `includes`, global declarations, `setup`, `loop`, user functions, and source metadata. Statements are recursive and include mission begin/end, motion, wheels, stop, delay, LED, gripper, sound, variable declaration/assignment/change, `if/else`, repeat/while/until/forever, function call/definition/return, comment, and raw C++. Expressions include number/string/boolean literals, variables, arithmetic, comparison, boolean operations, sensor reads, touch reads, calls, and raw expressions. Every parsed node may carry a source span `{start, end, lineStart, lineEnd}`; physical units are explicit (`mm`, `cm`, `deg`, `ms`, `hz`).

Round-trip invariants are:

1. statement order and nesting are preserved;
2. native motion patterns collapse only when all required calls are contiguous and compatible;
3. raw nodes retain their exact original text, scope, and ordering;
4. conversion never mutates the accepted project until the complete candidate result is available;
5. unsupported source never replaces either editor silently;
6. generated formatting may differ, but normalized IR before and after a round trip must be deeply equivalent.

## Capability matrix

| Construct | Classification |
|---|---|
| `LbMission.begin(button expression)`, `LbMission.end()` | native/full |
| `LbMotion.runLR(left, right)`, `runLRrpm(left, right)`, `waitDistanceMm(mm)`, `waitRotationDeg(deg)`, `stopAndWait()` | native/full |
| `Leanbot.pingCm/pingMm`, `LbIRArray.read`, `LbIRLine.isBlackDetected`, `LbTouch.read` | native/full |
| `LbRGB[led] = CRGB::Color` followed by `LbRGB.show()` | native/full |
| `LbGripper.open()`, `close()`, `moveTo(angle)`, `moveToLR(left,right,time)` | native/full |
| `Leanbot.tone(freq,duration)` followed optionally by `LbDelay(duration)` | native/full |
| number/boolean/string literals, variables, declaration, assignment, `+=/-=`, `+ - * / %`, `< <= == != >= >`, `&&/\|\|/!` | native/full |
| `random(min,max)` and `constrain(value,min,max)` expressions | native/full |
| `if/else`, canonical count-up `for`, `while`, `do/while(!condition)` as until, and `while(true)` as forever | native/full |
| `void` or scalar-return functions with scalar parameters, direct calls, and optional scalar return expression | native/full |
| comments adjacent to statements | native comment block |
| valid unknown expression/call/declaration with balanced syntax | raw C++ with exact source |
| `switch`, arrays, advanced preprocessor directives | raw/partial |
| pointers, `malloc/free`, inline assembly, templates, macros that alter syntax, malformed/unbalanced input | unsupported |

Includes, globals, and setup/loop placement remain explicit in IR. Unknown includes and global declarations are retained as raw nodes rather than discarded.

## Synchronization

Blockly edits update serialized workspace and IR and mark Blocks newer. Switching to C++ regenerates source from IR and marks both views synced. Monaco edits mark C++ newer. Switching back parses source; full/raw-compatible results replace IR and workspace, while unsupported results preserve the C++ source and ask the student whether to stay in C++, convert only the safe portion, or cancel.

Run always asks the store for the freshest C++ source. Projects persist after every state change and restore the last mode and synchronization state after refresh.

Synchronization is transactional. The store keeps hashes/revision numbers for the last mutually synchronized C++ and Blockly snapshots, plus independent dirty revisions. A mode switch creates a conversion candidate without editing live state. Success commits both representations and advances the common baseline. Cancel or failure is a no-op. If both current hashes differ from the baseline, the store enters `conflict`; the dialog can atomically choose Blocks, choose C++, or show a line-oriented C++ comparison plus a summary of Blockly IR changes before committing either side.

For unsupported C++, `cppSource` remains byte-for-byte unchanged. “Convert supported portion” builds a candidate workspace containing native blocks and exact-scope Raw C++ blocks for all structurally bounded fragments; only explicit confirmation commits this candidate. If tokenization or brace balancing fails, partial conversion is disabled and the only preservation candidate is one locked whole-file Raw C++ block. Staying in C++ and Cancel never change either representation.

## Persistence

The stored envelope is versioned and includes the entire project, last synchronized hashes, independent revisions, diagnostics, and timestamp. Normal writes are debounced and replace one localStorage key atomically; Ctrl+S and `pagehide`/visibility-hidden synchronously flush the latest in-memory snapshot. Loading validates the envelope; corrupt or unknown future versions fall back to a fresh project while preserving the unread payload in a recovery key. Quota/write failures retain the in-memory project, show a non-destructive warning, and keep the UI dirty until a later flush succeeds. Migration functions upgrade older envelopes without dropping `cppSource` or raw nodes.

## Student experience

The UI is a light, compact, professional IDE optimized for 1366×768. It exposes only project name, Blocks/C++ tabs, undo/redo, Blockly zoom controls when relevant, device connection, Run, Stop, synchronization status, and actionable conversion feedback. Internal compiler, HEX, packet, pin, and uploader details are not shown.

The component layer follows shadcn composition and styling using accessible Radix primitives. It provides local `Button`, `Tabs`, `Tooltip`, `DropdownMenu`, `Dialog`, `AlertDialog`, `Toast`, `Resizable`, and `Command` wrappers; the student surface uses the relevant primitive instead of bespoke inaccessible controls.

Blockly uses the official renderer and robotics-focused categories: Mission, Motion, Sensors, Touch, Logic, Loops, Math, Variables, Functions, LED, Sound, Gripper, and Raw C++. Workspace undo/redo remains Blockly-owned; Monaco owns its own undo stack. Toolbar actions dispatch to the active editor only. Monaco provides C++ highlighting, line numbers, indentation, bracket matching, Ctrl+S, Ctrl+/, undo/redo, Leanbot completion items, and parser diagnostics with line ranges.

Run first resolves the freshest source transactionally. Blocks runs perform workspace → IR → C++ without changing mode; C++ runs use the current source. `CompilerClient` posts that source to `/api/compile`; the production endpoint invokes Arduino CLI with the Uno FQBN and Leanbot library, returns Intel HEX, and reports sanitized diagnostics. The browser decodes HEX and uses the STK500v1 uploader over the explicitly selected Web Serial port: DTR reset, `GET_SYNC`, `ENTER_PROGMODE`, paged `LOAD_ADDRESS`/`PROG_PAGE`, `READ_PAGE` verification, `LEAVE_PROGMODE`, and reboot. All stages are abortable with bounded retry/timeouts. Stop aborts an in-flight compile/upload and, once firmware is running, sends the documented runtime stop command when supported. The student receives only phase-oriented progress and recovery messages.

## Testing

Pure unit tests cover every capability classification, motion round trips, variable edits, sensor `if`, functions/loops, Raw C++ and comment preservation, unsupported syntax, every dialog action, conflict transitions, versioned persistence, corruption recovery, freshest-source selection, Intel HEX parsing, and STK500 framing/retry/verification with a fake serial transport. Semantic round trips compare normalized IR, not formatting. Browser tests exercise real Blockly drag/drop/serialization, Monaco editing and shortcuts, mode switching, diagnostics, and refresh restoration. Integration tests compile a fixture through the real endpoint when Arduino CLI is available. Hardware acceptance tests 6–7 run the same Run action from each mode against a connected Leanbot fixture and assert successful verified upload; they are fixture-gated, not omitted from implementation.

## Scope boundary

The current repository starts without Arduino CLI, the AVR core, the Leanbot library, or a robot fixture. The implementation includes the compiler endpoint and production STK500 browser uploader, but local verification must report those environmental prerequisites clearly when unavailable. The UI must never claim compile, verification, or hardware success unless that stage actually completes.
