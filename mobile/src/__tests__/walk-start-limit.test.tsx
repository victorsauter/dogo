import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { sessionStore } from '@/auth/sessionStore';
import { latestWalkStart } from '@/lib/dates';
import { t } from '@/strings';
import { authResponse } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';

// The native picker is replaced by a component that records the props it receives.
const mockPicker = jest.fn((_props: Record<string, unknown>) => null);
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => mockPicker(props),
  DateTimePickerAndroid: { open: jest.fn() },
}));

afterEach(async () => {
  mockPicker.mockClear();
  await act(() => sessionStore.clear());
});

describe('date picker of a new walk', () => {
  it('is bounded to today and one year ahead, like the API', async () => {
    mockApi({});
    await sessionStore.set(authResponse());
    await renderRouter('./src/app', { initialUrl: '/walks/new' });
    await screen.findByLabelText(t.walk.title);

    await fireEvent.press(screen.getByRole('button', { name: new RegExp(t.walk.pickDate) }));

    const props = mockPicker.mock.calls.at(-1)![0] as { minimumDate: Date; maximumDate: Date };
    const now = new Date();
    expect(Math.abs(props.minimumDate.getTime() - now.getTime())).toBeLessThan(60_000);
    expect(Math.abs(props.maximumDate.getTime() - latestWalkStart(now).getTime())).toBeLessThan(
      60_000,
    );
    // One calendar year later: the same month, the next year.
    expect(props.maximumDate.getFullYear()).toBe(props.minimumDate.getFullYear() + 1);
    expect(props.maximumDate.getMonth()).toBe(props.minimumDate.getMonth());
  });
});
