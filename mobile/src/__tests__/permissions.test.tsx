import { render } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AppState, Linking, type AppStateStatus } from 'react-native';

import { sessionStore } from '@/auth/sessionStore';
import { PhotoPicker } from '@/components';
import { requestUserLocation } from '@/lib/location';
import { CameraPermissionError, pickPhoto } from '@/lib/photoPicker';
import { t } from '@/strings';
import { authResponse } from '@/test/fixtures';
import { mockApi, ok } from '@/test/mockApi';

jest.mock('@/lib/photoPicker', () => ({
  pickPhoto: jest.fn(),
  CameraPermissionError: class CameraPermissionError extends Error {},
}));

const APP_DIR = './src/app';

/** Collects the listeners the app registers for the app coming back to the foreground. */
function captureAppState() {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') listeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() };
  });
  return { returnToForeground: () => listeners.forEach((listener) => listener('active')) };
}

function refuseLocation() {
  jest
    .mocked(Location.requestForegroundPermissionsAsync)
    .mockResolvedValue({ granted: false, status: 'denied' } as never);
  jest
    .mocked(Location.getForegroundPermissionsAsync)
    .mockResolvedValue({ granted: false, status: 'denied' } as never);
}

afterEach(async () => {
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
    granted: true,
    status: 'granted',
  } as never);
  jest
    .mocked(Location.getForegroundPermissionsAsync)
    .mockResolvedValue({ granted: true, status: 'granted' } as never);
  await act(() => sessionStore.clear());
  jest.restoreAllMocks();
});

describe('location refused: the « Balades » tab', () => {
  async function openTab() {
    mockApi({ 'GET /api/v1/walks': () => ok([]) });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: '/' });
  }

  it('offers the system settings, and reads the permission again on return', async () => {
    refuseLocation();
    const appState = captureAppState();
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await openTab();

    expect(await screen.findByText(t.discover.locationDenied)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: t.common.openSettings }));
    expect(openSettings).toHaveBeenCalledTimes(1);

    // The person allowed the location in the settings and comes back.
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockResolvedValue({ granted: true, status: 'granted' } as never);
    await act(async () => appState.returnToForeground());

    await waitFor(() => expect(screen.queryByText(t.discover.locationDenied)).toBeNull());
    expect(screen.queryByRole('button', { name: t.common.openSettings })).toBeNull();
  });

  it('keeps the notice when the person comes back without allowing anything', async () => {
    refuseLocation();
    const appState = captureAppState();
    await openTab();
    await screen.findByText(t.discover.locationDenied);

    await act(async () => appState.returnToForeground());

    expect(Location.getForegroundPermissionsAsync).toHaveBeenCalled();
    expect(screen.getByText(t.discover.locationDenied)).toBeTruthy();
  });

  it('survives a device that cannot open the settings', async () => {
    refuseLocation();
    jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('unsupported'));
    await openTab();
    await fireEvent.press(await screen.findByRole('button', { name: t.common.openSettings }));
    expect(screen.getByText(t.discover.locationDenied)).toBeTruthy();
  });

  it('has no settings button when the position is only unavailable', async () => {
    jest.mocked(Location.requestForegroundPermissionsAsync).mockRejectedValue(new Error('off'));
    await openTab();
    expect(await screen.findByText(t.discover.locationDenied)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.common.openSettings })).toBeNull();
  });
});

describe('location refused: new walk', () => {
  it('offers the system settings next to the warning', async () => {
    refuseLocation();
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    mockApi({});
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: '/walks/new' });

    expect(await screen.findByText(t.walk.meetingPointNoLocation)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: t.common.openSettings }));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});

describe('camera refused: photo picker', () => {
  const picked = jest.fn();

  it('offers the system settings, and forgets the refusal once the app is back', async () => {
    const appState = captureAppState();
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    jest.mocked(pickPhoto).mockRejectedValue(new CameraPermissionError());
    await render(<PhotoPicker name="Léa" picked={null} onPick={picked} />);

    await fireEvent.press(screen.getByRole('button', { name: t.photo.takePhoto }));
    expect(await screen.findByText(t.photo.cameraDenied)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: t.common.openSettings }));
    expect(openSettings).toHaveBeenCalledTimes(1);

    await act(async () => appState.returnToForeground());
    expect(screen.queryByText(t.photo.cameraDenied)).toBeNull();
    expect(screen.queryByRole('button', { name: t.common.openSettings })).toBeNull();
  });

  it('shows no settings button for another failure', async () => {
    jest.mocked(pickPhoto).mockRejectedValue(new Error('broken'));
    await render(<PhotoPicker name="Léa" picked={null} onPick={picked} />);
    await fireEvent.press(screen.getByRole('button', { name: t.photo.fromLibrary }));
    expect(await screen.findByText(t.photo.pickFailed)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.common.openSettings })).toBeNull();
  });
});

describe('waiting for a position', () => {
  it('leaves no timer behind once the position is known', async () => {
    jest.useFakeTimers();
    try {
      jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce(null);
      const result = await requestUserLocation();
      expect(result.status).toBe('granted');
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives up after the delay when the position never comes', async () => {
    jest.useFakeTimers();
    try {
      jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce(null);
      jest.mocked(Location.getCurrentPositionAsync).mockReturnValueOnce(new Promise(() => {}));
      const pending = requestUserLocation();
      await jest.advanceTimersByTimeAsync(8000);
      await expect(pending).resolves.toEqual({ status: 'unavailable', coords: null });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
