/**
 * Deep link scheme of the app (`uzu://walks/<id>`), also the one of the push
 * notification links (ADR 0041). `app.config.ts` cannot be imported by the app
 * code, so the value is repeated here; `appConfig.test.ts` keeps it equal to
 * `APP.urlScheme`. The API writes the same scheme in the links it sends.
 */
export const APP_URL_SCHEME = 'uzu';
