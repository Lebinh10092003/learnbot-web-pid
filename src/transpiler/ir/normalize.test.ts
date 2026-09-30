import { describe, expect, it } from 'vitest';
import { normalizeProgram } from './normalize';
import type { LeanbotProgram, SourceSpan } from './types';

const span = (start: number): SourceSpan => ({
  start,
  end: start + 4,
  lineStart: start + 1,
  lineEnd: start + 1,
});

function makeProgram(): LeanbotProgram {
  return {
    includes: [
      { kind: 'include', path: 'Leanbot.h', system: false, span: span(0) },
    ],
    globals: [
      { kind: 'comment', text: '// preserve me', style: 'line', span: span(5) },
      {
        kind: 'variableDeclaration',
        name: 'threshold',
        valueType: 'number',
        initializer: {
          kind: 'binary',
          operator: '+',
          left: { kind: 'numberLiteral', value: 20, span: span(10) },
          right: { kind: 'numberLiteral', value: 5, span: span(15) },
          span: span(10),
        },
        span: span(8),
      },
      {
        kind: 'raw',
        code: 'const uint8_t pins[] = { 1, 2 };\n',
        scope: 'global',
        span: span(20),
      },
    ],
    setup: [
      {
        kind: 'missionBegin',
        button: { kind: 'variable', name: 'BTN1', span: span(30) },
        span: span(29),
      },
      {
        kind: 'if',
        condition: {
          kind: 'comparison',
          operator: '<',
          left: {
            kind: 'sensorRead',
            sensor: 'ultrasonic',
            unit: 'cm',
            span: span(35),
          },
          right: { kind: 'numberLiteral', value: 10, unit: 'cm', span: span(40) },
          span: span(35),
        },
        then: [
          {
            kind: 'delay',
            duration: { kind: 'numberLiteral', value: 500, unit: 'ms', span: span(45) },
            span: span(44),
          },
        ],
        else: [{ kind: 'stop', span: span(50) }],
        span: span(34),
      },
    ],
    loop: [
      {
        kind: 'repeat',
        count: { kind: 'numberLiteral', value: 3, span: span(60) },
        body: [
          {
            kind: 'wheels',
            left: { kind: 'numberLiteral', value: 100, span: span(65) },
            right: { kind: 'numberLiteral', value: 100, span: span(70) },
            mode: 'rpm',
            span: span(64),
          },
        ],
        span: span(59),
      },
      {
        kind: 'raw',
        code: 'mysteryCall(  1, /* exact */ 2);',
        scope: 'loop',
        span: span(75),
      },
    ],
    functions: [
      {
        kind: 'functionDefinition',
        name: 'driveFor',
        returnType: 'number',
        parameters: [
          { name: 'distance', valueType: 'number', unit: 'mm', span: span(80) },
        ],
        body: [
          {
            kind: 'return',
            value: {
              kind: 'arithmetic',
              operator: '*',
              left: { kind: 'variable', name: 'distance', span: span(85) },
              right: { kind: 'numberLiteral', value: 2, span: span(90) },
              span: span(85),
            },
            span: span(84),
          },
        ],
        span: span(79),
      },
    ],
    source: { language: 'cpp', fileName: 'mission.ino' },
    span: span(0),
  };
}

describe('normalizeProgram', () => {
  it('removes source spans recursively without mutating the parsed program', () => {
    const program = makeProgram();

    const normalized = normalizeProgram(program);

    expect(JSON.stringify(normalized)).not.toContain('"span"');
    expect(program.span).toEqual(span(0));
    expect(program.setup[1]).toHaveProperty('condition.span', span(35));
    expect(normalized).not.toBe(program);
  });

  it('preserves explicit physical units in nested expressions and parameters', () => {
    const normalized = normalizeProgram(makeProgram());

    expect(normalized.setup[1]).toMatchObject({
      condition: {
        left: { unit: 'cm' },
        right: { unit: 'cm' },
      },
      then: [{ duration: { unit: 'ms' } }],
    });
    expect(normalized.functions[0].parameters[0].unit).toBe('mm');
  });

  it('retains raw text, comment text, scope, and ordering exactly', () => {
    const normalized = normalizeProgram(makeProgram());

    expect(normalized.globals.map((node) => node.kind)).toEqual([
      'comment',
      'variableDeclaration',
      'raw',
    ]);
    expect(normalized.globals[0]).toMatchObject({
      kind: 'comment',
      text: '// preserve me',
      style: 'line',
    });
    expect(normalized.globals[2]).toMatchObject({
      kind: 'raw',
      code: 'const uint8_t pins[] = { 1, 2 };\n',
      scope: 'global',
    });
    expect(normalized.loop[1]).toMatchObject({
      kind: 'raw',
      code: 'mysteryCall(  1, /* exact */ 2);',
      scope: 'loop',
    });
  });

  it('preserves includes, globals, setup, loop, functions, and source metadata', () => {
    const normalized = normalizeProgram(makeProgram());

    expect(normalized.includes).toHaveLength(1);
    expect(normalized.globals).toHaveLength(3);
    expect(normalized.setup).toHaveLength(2);
    expect(normalized.loop).toHaveLength(2);
    expect(normalized.functions).toHaveLength(1);
    expect(normalized.functions[0]).toMatchObject({
      kind: 'functionDefinition',
      name: 'driveFor',
      returnType: 'number',
      body: [{ kind: 'return' }],
    });
    expect(normalized.source).toEqual({ language: 'cpp', fileName: 'mission.ino' });
  });
});
