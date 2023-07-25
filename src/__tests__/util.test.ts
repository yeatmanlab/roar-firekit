import { removeNull, removeUndefined } from '../firestore/util';

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
