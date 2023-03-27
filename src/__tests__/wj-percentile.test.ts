import { MockStorage } from './__mocks__/mock-storage';

const SWR_LOOKUP_TABLE_TEST_VERSION = 0.1;
jest.doMock('@google-cloud/storage', () => ({
  Storage: MockStorage,
}));

import { WJPercentile } from './../functions/wj-percentile';
const wjPercentileClient = new WJPercentile();

describe('WJPercentile class', () => {
  test('test the getLookupTablePath function', () => {
    const taskIds = ['asteroid-attack', 'honey-hunt', 'roar-pa', 'roar-anb', 'sre', 'swr'];

    for (const taskId of taskIds) {
      const expected = `lookup-tables/${taskId}-theta-table-${SWR_LOOKUP_TABLE_TEST_VERSION}.csv`;
      expect(WJPercentile.getLookupTablePath(taskId, SWR_LOOKUP_TABLE_TEST_VERSION.toString())).toBe(expected);
    }
  });

  test('test the cleanAge function', () => {
    const values = [
      [undefined, null],
      [null, null],
      ['Adult', 216],
      ['10+', 120],
      ['     12       ', 144],
    ];

    for (const value of values) {
      expect((wjPercentileClient as any).cleanAge(value[0])).toBe(value[1]);
    }
  });

  test('test the getWJPercentileScore function', async () => {
    const users = {
      user_1: '12',
      user_2: '25',
      user_3: '5',
      user_4: '7',
      user_5: '16',
      user_6: '',
      user_7: '13',
    };

    const data = [
      {
        firestorePid: 'user_1',
        thetaEstimate: '-3.7',
      },
      {
        firestorePid: 'user_2',
        thetaEstimate: '1.9',
      },
      {
        firestorePid: 'user_3',
        thetaEstimate: '2.0',
      },
      {
        firestorePid: 'user_4',
        thetaEstimate: '2.09',
      },
      {
        firestorePid: 'user_5',
        thetaEstimate: '2.642',
      },
      {
        firestorePid: 'user_6',
        thetaEstimate: '-0.432',
      },
      {
        firestorePid: 'user_7',
        thetaEstimate: '',
      },
    ];

    const expected = [
      {
        firestorePid: 'user_1',
        roarScore: '130',
        standardScore: '64',
        wjPercentile: '0.9',
      },
      {
        firestorePid: 'user_2',
        roarScore: null,
        standardScore: null,
        wjPercentile: null,
      },
      {
        firestorePid: 'user_3',
        roarScore: null,
        standardScore: null,
        wjPercentile: null,
      },
      {
        firestorePid: 'user_4',
        roarScore: '710',
        standardScore: '137',
        wjPercentile: '99.3',
      },
      {
        firestorePid: 'user_5',
        roarScore: '760',
        standardScore: '100',
        wjPercentile: '48.9',
      },
      {
        firestorePid: 'user_6',
        roarScore: null,
        standardScore: null,
        wjPercentile: null,
      },
      {
        firestorePid: 'user_7',
        roarScore: null,
        standardScore: null,
        wjPercentile: null,
      },
    ];

    const actual = await wjPercentileClient.getWJPercentileScore(data, users);

    expect(actual.length).toBe(expected.length);

    for (let i = 0; i < expected.length; i++) {
      const keys = ['roarScore', 'standardScore', 'wjPercentile'];
      for (const key of keys) {
        expect(actual[i][key]).toBe(expected[i][key]);
      }
    }
  });
});
