import type {
  LeanbotProgram,
  NormalizedLeanbotProgram,
  WithoutSourceSpans,
} from './types';

export function normalizeIr<T>(value: T): WithoutSourceSpans<T> {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeIr(item)) as WithoutSourceSpans<T>;
  }

  if (value !== null && typeof value === 'object') {
    const normalized = Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) =>
        key === 'span' ? [] : [[key, normalizeIr(child)]],
      ),
    );

    return normalized as WithoutSourceSpans<T>;
  }

  return value as WithoutSourceSpans<T>;
}

export function normalizeProgram(program: LeanbotProgram): NormalizedLeanbotProgram {
  return normalizeIr(program);
}
