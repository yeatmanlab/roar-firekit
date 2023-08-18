import {
  crc32String,
  getHierarchicalOrgs,
  getObjectDiff,
  removeNull,
  removeUndefined,
  replaceValues,
} from '../firestore/util';

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

describe('crc32String', () => {
  it('computes a checksum of emails', () => {
    const input = 'roar@stanford.edu';
    const expected = '5a036850';

    expect(crc32String(input)).toBe(expected);
  });
});

describe('getHierarchicalOrgs', () => {
  it('correctly nests orgs', () => {
    const expected = {
      eduOrgs: [
        {
          id: '0',
          foo: 'bar',
          children: [
            {
              districtId: '0',
              id: '0-0',
              baz: 'bat',
              children: [
                { schoolId: '0-0', id: '0-0-0', data: 42 },
                { schoolId: '0-0', id: '0-0-1', data: 33 },
              ],
            },
            {
              districtId: '0',
              id: '0-1',
              children: [{ schoolId: '0-1', id: '0-1-0', data: 22 }],
            },
          ],
        },
        {
          id: '1',
          foo: 'buzz',
          children: [
            {
              districtId: '1',
              id: '1-0',
              baz: 'flurf',
              children: [
                { schoolId: '1-0', id: '1-0-0', data: 52 },
                { schoolId: '1-0', id: '1-0-1', data: 43 },
              ],
            },
            {
              districtId: '1',
              id: '1-1',
              children: [{ schoolId: '1-1', id: '1-1-0', data: 32 }],
            },
          ],
        },
      ],
      groups: undefined,
      families: undefined,
    };

    const input = {
      districts: [
        {
          id: '0',
          foo: 'bar',
        },
        {
          id: '1',
          foo: 'buzz',
        },
      ],
      schools: [
        {
          districtId: '0',
          id: '0-0',
          baz: 'bat',
        },
        {
          districtId: '0',
          id: '0-1',
        },
        {
          districtId: '1',
          id: '1-0',
          baz: 'flurf',
        },
        {
          districtId: '1',
          id: '1-1',
        },
      ],
      classes: [
        { schoolId: '0-0', id: '0-0-0', data: 42 },
        { schoolId: '0-0', id: '0-0-1', data: 33 },
        { schoolId: '0-1', id: '0-1-0', data: 22 },
        { schoolId: '1-0', id: '1-0-0', data: 52 },
        { schoolId: '1-0', id: '1-0-1', data: 43 },
        { schoolId: '1-1', id: '1-1-0', data: 32 },
      ],
    };

    const result = getHierarchicalOrgs(input);

    expect(result).toStrictEqual(expected);
  });
});
