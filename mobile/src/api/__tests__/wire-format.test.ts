import {
  emptyWalkForm,
  toCreateDogRequest,
  toCreateWalkRequest,
  toUpdateDogRequest,
  toUpdateWalkRequest,
  type DogFormValues,
  type WalkFormValues,
} from '@/lib/forms';
import { jsonResponse } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';

import { api } from '../client';
import { enumValues } from '../enums';
import {
  defaultWalkFilters,
  searchParamsAround,
  searchParamsFor,
  type WalkFilters,
} from '../walks';

/**
 * What the API accepts (spec §1): dates and times with an explicit offset (`Z` or
 * `±hh:mm`), enumerations by their name and never by their integer value.
 */
const EXPLICIT_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T/;

/** Every string of a JSON value that looks like a date and time. */
function dateTimes(value: unknown): string[] {
  if (typeof value === 'string') return DATE_TIME.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(dateTimes);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(dateTimes);
  return [];
}

const allNames = new Set<string>(Object.values(enumValues).flat());

const walkValues: WalkFormValues = {
  ...emptyWalkForm({ latitude: 47.5324, longitude: 7.1858 }, new Date(2026, 10, 25, 10, 30)),
  title: 'Tour du lac',
  locationLabel: 'Parvis',
  allowedSizes: ['Large', 'Small'],
};

const dogValues: DogFormValues = {
  name: 'Nala',
  size: 'Small',
  sociability: 'Selective',
  reactivity: 'None',
  leashHabit: 'OnLeash',
  birthDate: new Date(2021, 2, 5),
  breed: '',
  description: '',
};

describe('dates sent to the API', () => {
  it('walk bodies carry the start with an explicit offset, whatever the device time zone', () => {
    for (const body of [toCreateWalkRequest(walkValues), toUpdateWalkRequest(walkValues)]) {
      expect(body.startsAt).toMatch(EXPLICIT_OFFSET);
      expect(new Date(body.startsAt!).getTime()).toBe(walkValues.startsAt.getTime());
      expect(dateTimes(body).every((value) => EXPLICIT_OFFSET.test(value))).toBe(true);
    }
  });

  it('the search « to » parameter carries an explicit offset for each period', () => {
    const now = new Date(2026, 10, 19, 14, 7, 31);
    const center = { latitude: 47.5, longitude: 7.2 };
    for (const period of ['today', 'week'] as const) {
      const params = searchParamsAround(center, 10, { ...defaultWalkFilters, period }, now);
      expect(params.to).toMatch(EXPLICIT_OFFSET);
    }
    expect(searchParamsAround(center, 10, { ...defaultWalkFilters, period: 'all' }, now).to).toBe(
      undefined,
    );
    const region = { ...center, latitudeDelta: 0.1, longitudeDelta: 0.1 };
    expect(searchParamsFor(region, defaultWalkFilters, now).to).toMatch(EXPLICIT_OFFSET);
  });

  it('a dog birth date is a calendar day, not a date and time', () => {
    expect(toCreateDogRequest(dogValues).birthDate).toBe('2021-03-05');
    expect(toUpdateDogRequest(dogValues).birthDate).toBe('2021-03-05');
  });

  it('on the wire: the start of a created walk and the search query', async () => {
    const { calls } = mockApi({
      'POST /api/v1/walks': () => jsonResponse({}),
      'GET /api/v1/walks': () => jsonResponse([]),
    });
    await api.POST('/api/v1/walks', { body: toCreateWalkRequest(walkValues) });
    await api.GET('/api/v1/walks', {
      params: {
        query: searchParamsAround(
          { latitude: 47.5, longitude: 7.2 },
          5,
          { period: 'today', size: 'Medium' },
          new Date(2026, 10, 19, 14, 7),
        ),
      },
    });

    const created = calls.find((call) => call.method === 'POST')!;
    expect(dateTimes(created.json).every((value) => EXPLICIT_OFFSET.test(value))).toBe(true);
    const query = new URL(`http://x${calls.find((call) => call.method === 'GET')!.path}`)
      .searchParams;
    expect(query.get('to')).toMatch(EXPLICIT_OFFSET);
  });
});

describe('enumerations sent to the API', () => {
  /** Every string value of the body that is an enumeration name, and nothing numeric among them. */
  const enumFields = (body: Record<string, unknown>, fields: string[]) =>
    fields.map((field) => body[field]).flat();

  it('walk bodies name sizes, leash rule and access', () => {
    const body = toCreateWalkRequest({ ...walkValues, access: 'Approval' });
    expect(enumFields(body, ['allowedSizes', 'leashRule', 'access'])).toEqual([
      'Small',
      'Large',
      'LeashRequired',
      'Approval',
    ]);
    for (const value of enumFields(toUpdateWalkRequest(walkValues), [
      'allowedSizes',
      'leashRule',
      'access',
    ])) {
      expect(allNames.has(value as string)).toBe(true);
    }
  });

  it('dog bodies name size, sociability, reactivity and leash habit', () => {
    for (const body of [toCreateDogRequest(dogValues), toUpdateDogRequest(dogValues)]) {
      for (const value of enumFields(body, ['size', 'sociability', 'reactivity', 'leashHabit'])) {
        expect(typeof value).toBe('string');
        expect(allNames.has(value as string)).toBe(true);
      }
    }
  });

  it.each(enumValues.DogSize)('the size filter of the search is sent as « %s »', async (size) => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => jsonResponse([]) });
    const filters: WalkFilters = { period: 'all', size };
    await api.GET('/api/v1/walks', {
      params: {
        query: searchParamsAround({ latitude: 47.5, longitude: 7.2 }, 5, filters),
      },
    });
    expect(new URL(`http://x${calls[0]!.path}`).searchParams.get('size')).toBe(size);
  });

  it('no filter on size sends no size at all', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => jsonResponse([]) });
    await api.GET('/api/v1/walks', {
      params: {
        query: searchParamsAround({ latitude: 47.5, longitude: 7.2 }, 5, defaultWalkFilters),
      },
    });
    expect(new URL(`http://x${calls[0]!.path}`).searchParams.has('size')).toBe(false);
  });

  it.each([
    ['Organizer', 'Upcoming'],
    ['Participant', 'Past'],
  ] as const)('« Mes balades » sends role=%s and when=%s by name', async (role, when) => {
    const { calls } = mockApi({ 'GET /api/v1/me/walks': () => jsonResponse([]) });
    await api.GET('/api/v1/me/walks', { params: { query: { role, when } } });
    const query = new URL(`http://x${calls[0]!.path}`).searchParams;
    expect(query.get('role')).toBe(role);
    expect(query.get('when')).toBe(when);
    expect(Number.isNaN(Number(query.get('role')))).toBe(true);
  });
});
