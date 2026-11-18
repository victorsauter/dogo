import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Identity of the app. This is the only place to change when the app is renamed
 * (see "Construire une version de test" in mobile/README.md for what else follows:
 * the Apple audience of the API, the OAuth clients of Google, the store listings).
 * The bundle identifier and the package name are frozen once a first build has
 * been sent to TestFlight or Google Play.
 */
export const APP = {
  /** Name shown under the icon and in the permission texts. */
  displayName: 'dogo',
  /** Expo slug, also the project name on expo.dev. */
  slug: 'dogo',
  /** Deep link scheme (`dogo://walks/<id>`), also used by push notification links. */
  urlScheme: 'dogo',
  /** Provisional identifier, to confirm before any store submission (spec §7). */
  iosBundleIdentifier: 'com.victorsauter.dogo',
  androidPackage: 'com.victorsauter.dogo',
} as const;

/**
 * Brand colours of the splash screen, the adaptive icon and notifications. They
 * repeat the « Uzu » tokens of `src/theme/tokens.ts` (ADR 0030); a test keeps
 * them equal.
 */
export const BRAND = {
  backgroundLight: '#FBF6EC',
  backgroundDark: '#14100D',
  primary: '#9C5626',
} as const;

/**
 * Permission texts shown by iOS and Android when the app asks for access.
 * Later features (map, photos, notifications) reuse these exact strings when
 * they add the matching Expo module config plugin.
 */
const permissions = {
  locationWhenInUse: `${APP.displayName} utilise ta position pour te montrer les balades proches de toi et placer un point de rendez-vous.`,
  photoLibrary: `${APP.displayName} accède à tes photos pour que tu choisisses ta photo de profil et celles de tes chiens.`,
  camera: `${APP.displayName} utilise l’appareil photo pour prendre ta photo de profil et celles de tes chiens.`,
} as const;

/** Environment variables read by the configuration (`process.env` in practice, injected in tests). */
export type ConfigEnv = Record<string, string | undefined>;

/**
 * EAS build profiles whose result is installed by people other than the
 * developer; the build fails early when their configuration cannot work.
 */
const DISTRIBUTION_PROFILES: readonly string[] = ['preview', 'production'];

/**
 * Stops a `preview` or `production` build that would ship a broken or unsafe
 * app: the API address must be given and use `https` (otherwise the app only
 * shows its « Application mal configurée » screen), and the test sign-in must
 * not be enabled. EAS Build sets `EAS_BUILD_PROFILE` to the profile name of
 * `eas.json` while it evaluates this file; local development and tests do not
 * have it, so they are never blocked.
 */
export function assertDistributionConfig(env: ConfigEnv): void {
  const profile = env.EAS_BUILD_PROFILE?.trim();
  if (!profile || !DISTRIBUTION_PROFILES.includes(profile)) return;

  const problems: string[] = [];
  const apiUrl = env.EXPO_PUBLIC_API_URL?.trim() ?? '';
  if (!apiUrl) {
    problems.push(
      'EXPO_PUBLIC_API_URL is missing: set it in the EAS environment variables of this profile (see mobile/README.md).',
    );
  } else if (!/^https:\/\/[^/\s]+/i.test(apiUrl)) {
    problems.push(
      `EXPO_PUBLIC_API_URL must start with https:// in a distribution build (got "${apiUrl}").`,
    );
  }
  if (env.EXPO_PUBLIC_DEV_LOGIN?.trim().toLowerCase() === 'true') {
    problems.push(
      'EXPO_PUBLIC_DEV_LOGIN=true must not be set in a distribution build: remove it from the EAS environment variables of this profile.',
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `Invalid configuration for the EAS build profile "${profile}":\n- ${problems.join('\n- ')}`,
    );
  }
}

/**
 * Google sign-in needs custom native code (development build) and its config
 * plugin wants the iOS URL scheme, the reversed iOS client ID. Without the iOS
 * client ID the plugin is left out, so Expo Go and `expo export` keep working.
 */
function googleSignInPlugin(env: ConfigEnv): [string, { iosUrlScheme: string }][] {
  const iosClientId = env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
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

/**
 * Builds the Expo configuration from the environment. Everything that differs
 * between development, `preview` and `production` comes from variables (EAS
 * environment variables on a build, `.env` locally), never from the repository.
 */
export function createConfig({ config }: ConfigContext, env: ConfigEnv = process.env): ExpoConfig {
  assertDistributionConfig(env);

  /** EAS project ID, absent until an EAS project exists: push notifications are then unavailable. */
  const easProjectId = env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  /**
   * Google Maps key of the Android build, read at build time. Without it the map
   * stays grey outside Expo Go. It ends up readable in the app: restrict it in
   * the Google console (package name and certificate fingerprint).
   */
  const googleMapsAndroidApiKey = env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  /**
   * Path of `google-services.json` (Firebase), needed by Android push
   * notifications. On EAS it is the path of an environment variable of type
   * file; locally it is usually unset.
   */
  const googleServicesFile = env.GOOGLE_SERVICES_JSON?.trim();

  return {
    ...config,
    name: APP.displayName,
    slug: APP.slug,
    scheme: APP.urlScheme,
    platforms: ['ios', 'android'],
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: APP.iosBundleIdentifier,
      supportsTablet: false,
      usesAppleSignIn: true,
      config: {
        // The app only uses the encryption of the system (HTTPS): no export question at each TestFlight upload.
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: permissions.locationWhenInUse,
        NSPhotoLibraryUsageDescription: permissions.photoLibrary,
        NSCameraUsageDescription: permissions.camera,
      },
    },
    android: {
      package: APP.androidPackage,
      adaptiveIcon: {
        backgroundColor: BRAND.backgroundLight,
        foregroundImage: './assets/android-icon-foreground.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.CAMERA',
        'android.permission.POST_NOTIFICATIONS',
      ],
      predictiveBackGestureEnabled: false,
      ...(googleMapsAndroidApiKey
        ? { config: { googleMaps: { apiKey: googleMapsAndroidApiKey } } }
        : {}),
      ...(googleServicesFile ? { googleServicesFile } : {}),
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
      // development, `GOOGLE_MAPS_ANDROID_API_KEY` for a build, see mobile/README.md).
      ['expo-location', { locationWhenInUsePermission: permissions.locationWhenInUse }],
      [
        'expo-notifications',
        {
          defaultChannel: 'default',
          // Android only: all-white silhouette on a transparent background, tinted with the brand colour.
          icon: './assets/notification-icon.png',
          color: BRAND.primary,
        },
      ],
      ...googleSignInPlugin(env),
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 160,
          resizeMode: 'contain',
          backgroundColor: BRAND.backgroundLight,
          dark: { backgroundColor: BRAND.backgroundDark },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
  };
}

export default (context: ConfigContext): ExpoConfig => createConfig(context);
