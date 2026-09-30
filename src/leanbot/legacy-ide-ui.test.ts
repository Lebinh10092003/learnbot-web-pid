/**
 * legacy-ide-ui.test.ts — Gate A UI and asset-contract tests
 *
 * Tests the ideFlowPolicy module (pure logic) and static asset contracts
 * (version tokens, theme colors, block style counts, message strings).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// @ts-expect-error The imported IDE is intentionally plain JavaScript.
import { withLockedControls, getCompileSuccessNotice, getUploadNotice } from '../../public/leanbot-ide/ideFlowPolicy.js';

const ROOT = resolve(__dirname, '../..');

// ── Static content helpers ────────────────────────────────────────────
function readPublic(...parts: string[]) {
  return readFileSync(resolve(ROOT, 'public', 'leanbot-ide', ...parts), 'utf-8');
}
function readPublicBlockly(...parts: string[]) {
  return readPublic('LB-blockly', ...parts);
}

// ── ideFlowPolicy: withLockedControls ────────────────────────────────
describe('withLockedControls', () => {
  it('disables then re-enables controls around a successful operation', async () => {
    const setEnabled = vi.fn();
    const result = await withLockedControls(setEnabled, async () => 42);
    expect(result).toBe(42);
    expect(setEnabled.mock.calls).toEqual([[false], [true]]);
  });

  it('re-enables controls even when the operation throws', async () => {
    const setEnabled = vi.fn();
    await expect(
      withLockedControls(setEnabled, async () => { throw new Error('network'); })
    ).rejects.toThrow('network');
    expect(setEnabled.mock.calls).toEqual([[false], [true]]);
  });
});

// ── ideFlowPolicy: getCompileSuccessNotice ────────────────────────────
describe('getCompileSuccessNotice', () => {
  it('returns "Compile Successful With Warnings" for logs containing "warning:"', () => {
    const notice = getCompileSuccessNotice('warning: x');
    expect(notice.text).toBe('Compile Successful With Warnings');
    expect(notice.status).toBe('warning');
  });

  it('sets closeProgram=true when there are no warnings', () => {
    const notice = getCompileSuccessNotice('ok');
    expect(notice.closeProgram).toBe(true);
    expect(notice.text).toBe('Compile Successful');
  });

  it('sets closeProgram=false when warnings are present', () => {
    const notice = getCompileSuccessNotice('warning: unused variable');
    expect(notice.closeProgram).toBe(false);
  });
});

// ── ideFlowPolicy: getUploadNotice ────────────────────────────────────
describe('getUploadNotice', () => {
  it('returns success with disconnectSafe=true for verified upload', () => {
    const notice = getUploadNotice({ success: true, verified: true });
    expect(notice).toEqual({
      kind: 'success',
      disconnectSafe: true,
      message: 'Upload Successful — You Can Disconnect The USB Cable And Run The Robot.',
    });
  });

  it('returns cancelled for exception="cancelled"', () => {
    expect(getUploadNotice({ success: false, exception: 'cancelled' }).kind).toBe('cancelled');
  });

  it('returns error for non-cancelled exception', () => {
    expect(getUploadNotice({ success: false, exception: 'verify failed' }).kind).toBe('error');
  });

  it('treats success without verified as error', () => {
    expect(getUploadNotice({ success: true }).kind).toBe('error');
  });
});

// ── Asset contracts: outer HTML (index.html) ─────────────────────────
describe('outer index.html asset contracts', () => {
  const outerHtml = readPublic('index.html');

  it('styles.css uses release token ?v=20260930-2', () => {
    expect(outerHtml).toContain('styles.css?v=20260930-2');
  });

  it('main.js uses release token ?v=20260930-2', () => {
    expect(outerHtml).toContain('main.js?v=20260930-2');
  });

  it('LB-blockly iframe src uses release token ?v=20260930-2', () => {
    expect(outerHtml).toContain('LB-blockly/index.html?v=20260930-2');
  });
});

// ── Asset contracts: inner HTML (LB-blockly/index.html) ──────────────
describe('inner LB-blockly/index.html asset contracts', () => {
  const innerHtml = readPublicBlockly('index.html');

  it('themes_categories.js uses release token', () => {
    expect(innerHtml).toContain('themes_categories.js?v=20260930-2');
  });

  it('blocks/myblocks.js uses release token', () => {
    expect(innerHtml).toContain('blocks/myblocks.js?v=20260930-2');
  });

  it('arduino/addon/myblocks.js uses release token', () => {
    expect(innerHtml).toContain('arduino/addon/myblocks.js?v=20260930-2');
  });
});

// ── Asset contracts: theme colour ────────────────────────────────────
describe('themes_categories.js colour contract', () => {
  const theme = readPublicBlockly('blocklyduino', 'themes', 'themes_categories.js');

  it('myblocks_category colour is #3373CC (blue)', () => {
    expect(theme).toMatch(/"myblocks_category"\s*:\s*\{\s*"colour"\s*:\s*"#3373CC"/);
  });
});

// ── Asset contracts: block style count ───────────────────────────────
describe('blocks/myblocks.js style contract', () => {
  const blockDefinitions = readPublicBlockly('blocklyduino', 'blocks', 'myblocks.js');

  it('uses myBlocksCategoryStyle exactly 8 times', () => {
    const matches = blockDefinitions.match(/"?style"?:\s*myBlocksCategoryStyle/g);
    expect(matches).toHaveLength(8);
  });
});

// ── Asset contracts: main.js and ideFlowPolicy.js message strings ────
describe('main.js message string contracts', () => {
  const mainSource = readPublic('main.js');
  const policySource = readPublic('ideFlowPolicy.js');

  it('contains "Compile Successful With Warnings" in ideFlowPolicy.js', () => {
    expect(policySource).toContain('Compile Successful With Warnings');
  });

  it('contains full upload success message', () => {
    expect(mainSource).toContain(
      'Upload Successful — You Can Disconnect The USB Cable And Run The Robot.'
    );
  });
});
