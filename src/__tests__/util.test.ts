import { getObjectDiff, removeNull, removeUndefined, replaceValues } from '../firestore/util';

describe('removeNull', () => {
  it('removes null values', () => {
    const input = {
      a: 1,
      b: 'foo',
      c: null,
      d: '',
      e: null,
      f: {
        g: 1,
        h: 'foo',
        i: null,
        j: '',
        k: null,
      },
    };

    const expected = {
      a: 1,
      b: 'foo',
      d: '',
      f: {
        g: 1,
        h: 'foo',
        i: null,
        j: '',
        k: null,
      },
    };

    expect(removeNull(input)).toStrictEqual(expected);
  });
});

describe('removeUndefined', () => {
  it('removes null values', () => {
    const input = {
      a: 1,
      b: 'foo',
      c: undefined,
      d: '',
      e: undefined,
      f: {
        g: 1,
        h: 'foo',
        i: undefined,
        j: '',
        k: undefined,
      },
    };

    const expected = {
      a: 1,
      b: 'foo',
      d: '',
      f: {
        g: 1,
        h: 'foo',
        i: undefined,
        j: '',
        k: undefined,
      },
    };

    expect(removeUndefined(input)).toStrictEqual(expected);
  });
});

describe('getObjectDiff', () => {
  it('detects changed keys', () => {
    const obj1 = {
      a: 1,
      b: 2,
      c: { foo: 1, bar: 2 },
      d: { baz: 1, bat: 2 },
    };

    const obj2 = {
      b: 2,
      c: { foo: 1, bar: 'monkey' },
      d: { baz: 1, bat: 2 },
      e: 1,
    };

    const result = getObjectDiff(obj1, obj2);
    const expected = ['c', 'e', 'a'];

    expect(result.sort()).toEqual(expected.sort());
  });
});

describe('replaceValues', () => {
  it('replaces values with default args', () => {
    const input = {
      a: undefined,
      b: 1,
      c: { foo: 1, bar: undefined },
      d: { baz: 1, bat: { e: 42, f: undefined } },
    };

    const expected1 = {
      a: null,
      b: 1,
      c: { foo: 1, bar: null },
      d: { baz: 1, bat: { e: 42, f: null } },
    };

    const expected2 = {
      a: undefined,
      b: '1',
      c: { foo: '1', bar: undefined },
      d: { baz: '1', bat: { e: 42, f: undefined } },
    };

    const result1 = replaceValues(input);
    const result2 = replaceValues(input, 1, '1');

    expect(result1).toStrictEqual(expected1);
    expect(result2).toStrictEqual(expected2);
  });
});
