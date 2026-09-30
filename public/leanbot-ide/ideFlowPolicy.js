/**
 * ideFlowPolicy.js — Leanbot IDE Lifecycle Policy
 *
 * Pure, testable functions that encapsulate the compile/upload lifecycle.
 * No DOM references; classifiers return plain data objects.
 * Import as: import { withLockedControls, getCompileSuccessNotice, getUploadNotice } from './ideFlowPolicy.js?v=20260930-2'
 */

/**
 * Disables UI controls, awaits `operation`, then re-enables in `finally`.
 * @param {(enabled: boolean) => void} setEnabled - called with false before, true after.
 * @param {() => Promise<any>} operation
 * @returns {Promise<any>}
 */
export async function withLockedControls(setEnabled, operation) {
  setEnabled(false);
  try {
    return await operation();
  } finally {
    setEnabled(true);
  }
}

/**
 * Classifies a compile log message and returns a toast descriptor.
 * @param {string} log - raw compiler log output
 * @returns {{ text: string, status: string, closeProgram: boolean }}
 */
export function getCompileSuccessNotice(log) {
  const hasWarnings = /\bwarning:/i.test(log);
  return {
    text: hasWarnings ? 'Compile Successful With Warnings' : 'Compile Successful',
    status: hasWarnings ? 'warning' : 'success',
    closeProgram: !hasWarnings,
  };
}

/**
 * Classifies an upload result and returns a structured outcome.
 * @param {{ success: boolean, verified?: boolean, exception?: string }} result
 * @returns {{ kind: 'success' | 'cancelled' | 'error', disconnectSafe?: boolean, message?: string }}
 */
export function getUploadNotice(result) {
  if (result.success && result.verified === true) {
    return {
      kind: 'success',
      disconnectSafe: true,
      message: 'Upload Successful — You Can Disconnect The USB Cable And Run The Robot.',
    };
  }

  if (!result.success) {
    const exc = typeof result.exception === 'string' ? result.exception : '';
    if (exc === 'cancelled') {
      return { kind: 'cancelled' };
    }
    return {
      kind: 'error',
      message: exc || 'Upload failed.',
    };
  }

  // success but not verified — treat as error
  return {
    kind: 'error',
    message: 'Upload could not be verified. Please try again.',
  };
}
