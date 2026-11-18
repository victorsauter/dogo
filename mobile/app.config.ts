import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Permission texts shown by iOS and Android when the app asks for access.
 * Later features (map, photos, notifications) reuse these exact strings when
 * they add the matching Expo module config plugin.
 */
const permissions = {
  locationWhenInUse:
    'dogo utilise ta position pour te montrer les balades proches de toi et placer un point de rendez-vous.',
  photoLibrary:
    'dogo accède à tes photos pour que tu choisisses ta photo de profil et celles de tes chiens.',
  camera: 'dogo utilise l’appareil photo pour prendre ta photo de profil et celles de tes chiens.',
} as const;

/**
 * Google sign-in needs custom native code (development build) and its config
 * plugin wants the iOS URL scheme, the reversed iOS client ID. Without the iOS
 * client ID the plugin is left out, so Expo Go and `expo export` keep working.
 */
function googleSignInPlugin(): [string, { iosUrlScheme: string }][] {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const suffix = '.apps.googleusercontent.com';
  if (!iosClientId?.endsWith(suffix)) return [];
  const prefix = iosClientId.slice(0, -suffix.length);
  return [
    [
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: `com.googleusercontent.apps.${prefix}` },
    ],
  ];
}

/** EAS project ID, absent until an EAS project exists: push notifications are then unavailable. */
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();

const brandColor = '#F4EFE6';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'dogo',
  slug: 'dogo',
  scheme: 'dogo',
  platforms: ['ios', 'android'],
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    // Provisional identifier, to confirm before any store submission (spec §7).
    bundleIdentifier: 'com.victorsauter.dogo',
    supportsTablet: false,
    usesAppleSignIn: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: permissions.locationWhenInUse,
      NSPhotoLibraryUsageDescription: permissions.photoLibrary,
      NSCameraUsageDescription: permissions.camera,
    },
  },
  android: {
    package: 'com.victorsauter.dogo',
    adaptiveIcon: {
      backgroundColor: brandColor,
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.CAMERA',
      'android.permission.POST_NOTIFICATIONS',
    ],
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  ...(easProjectId ? { extra: { ...config.extra, eas: { projectId: easProjectId } } } : {}),
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    [
      'expo-image-picker',
      {
        photosPermission: permissions.photoLibrary,
        cameraPermission: permissions.camera,
        microphonePermission: false,
      },
    ],
    '@react-native-community/datetimepicker',
    // Apple Maps on iOS needs no key; Android uses Google Maps (Expo Go's key in
    // development, a key of our own for a store build, see mobile/README.md).
    ['expo-location', { locationWhenInUsePermission: permissions.locationWhenInUse }],
    ['expo-notifications', { defaultChannel: 'default' }],
    ...googleSignInPlugin(),
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: brandColor,
        dark: { backgroundColor: '#1C1A17' },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
