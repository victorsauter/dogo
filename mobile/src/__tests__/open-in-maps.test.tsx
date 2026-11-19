import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert, Linking, Platform } from 'react-native';

import { sessionStore } from '@/auth/sessionStore';
import { mapUrls, openMapsAt } from '@/lib/linking';
import { t } from '@/strings';
import { authResponse, walkDetail } from '@/test/fixtures';
import { mockApi, ok } from '@/test/mockApi';

const point = { latitude: 47.5324, longitude: 7.1858 };

afterEach(async () => {
  await act(() => sessionStore.clear());
  jest.restoreAllMocks();
});

describe('addresses of a place', () => {
  it('starts with the device’s own maps app, then a web address', () => {
    const [ios, iosWeb] = mapUrls(point, 'Parvis de l’église', 'ios');
    expect(ios).toBe(
      'https://maps.apple.com/?ll=47.5324,7.1858&q=Parvis%20de%20l%E2%80%99%C3%A9glise',
    );
    const [android, androidWeb] = mapUrls(point, 'Parvis', 'android');
    expect(android).toBe('geo:47.5324,7.1858?q=47.5324,7.1858(Parvis)');
    expect(iosWeb).toBe('https://www.google.com/maps/search/?api=1&query=47.5324,7.1858');
    expect(androidWeb).toBe(iosWeb);
  });

  it('falls back to the web address when the native one cannot be opened', async () => {
    const open = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('no maps app'))
      .mockResolvedValueOnce();
    await expect(openMapsAt(point, 'Parvis')).resolves.toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[1]![0]).toMatch(/^https:\/\/www\.google\.com\/maps/);
  });

  it('says so, without throwing, when nothing opens', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('nothing'));
    await expect(openMapsAt(point, 'Parvis')).resolves.toBe(false);
  });
});

describe('« Ouvrir dans Plans » on a walk', () => {
  const walk = walkDetail();
  const label = Platform.OS === 'ios' ? t.walk.openInMaps : t.walk.openInMapsAndroid;

  async function openWalk() {
    mockApi({
      [`GET /api/v1/walks/${walk.id}`]: () => ok(walk),
      'GET /api/v1/me/dogs': () => ok([]),
    });
    await sessionStore.set(authResponse());
    await renderRouter('./src/app', { initialUrl: `/walks/${walk.id}` });
    return screen.findByRole('button', { name: label });
  }

  it('opens the meeting point', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await fireEvent.press(await openWalk());
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('tells the person when no maps app can be opened, instead of failing silently', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('nothing'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await fireEvent.press(await openWalk());
    await waitFor(() => expect(alert).toHaveBeenCalledWith(t.walk.openInMapsFailed));
  });
});
