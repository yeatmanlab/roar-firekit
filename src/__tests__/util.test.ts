import { getObjectDiff, removeNull, removeUndefined } from '../firestore/util';

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
