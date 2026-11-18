// The project has no Node type definitions: only what this test uses is declared.
declare const __dirname: string;
interface DirEntry {
  name: string;
  isDirectory(): boolean;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const { readdirSync, readFileSync } = require('node:fs') as {
  readdirSync(dir: string, options: { withFileTypes: true }): DirEntry[];
  readFileSync(path: string, encoding: 'utf8'): string;
};
const { join } = require('node:path') as { join(...parts: string[]): string };
/* eslint-enable @typescript-eslint/no-require-imports */

const APP_DIR = join(__dirname, '..', 'app');

/** Route names of a directory, as Expo Router names them (`dogs/[id]/index`, `(tabs)`). */
function routeNames(dir: string, prefix = ''): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.isDirectory()) {
      if (prefix === '' && /^\(.+\)$/.test(entry.name)) names.push(entry.name);
      else if (!/^\(.+\)$/.test(entry.name))
        names.push(...routeNames(join(dir, entry.name), `${prefix}${entry.name}/`));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.startsWith('_')) {
      names.push(prefix + entry.name.replace(/\.tsx?$/, ''));
    }
  }
  return names;
}

/**
 * The order Expo Router gives a navigator's routes (`sortRoutes`): `index` and
 * groups first, then static routes by name length, then dynamic ones; ties keep
 * the alphabetical order of the files.
 */
function expoRouterOrder(names: string[]): string[] {
  const rank = (name: string) =>
    name.includes('[') ? 2 : name === 'index' || /^\(.+\)$/.test(name) ? 0 : 1;
  return names
    .map((name, index) => ({ name, index }))
    .sort((a, b) => {
      const byRank = rank(a.name) - rank(b.name);
      if (byRank !== 0) return byRank;
      if (rank(a.name) === 1 && a.name.length !== b.name.length)
        return a.name.length - b.name.length;
      return a.index - b.index;
    })
    .map(({ name }) => name);
}

/** `name` of every `<Stack.Screen>` / `<Tabs.Screen>` of a layout, in declaration order. */
function declaredScreens(layout: string): string[] {
  const source = readFileSync(layout, 'utf8');
  return [...source.matchAll(/<(?:Stack|Tabs)\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]!);
}

/**
 * A layout that declares its screens in another order than Expo Router sorts
 * them makes the navigator queue a ROUTE_NAMES_CHANGED action that nothing
 * handles, reported as an error at every start in development (ADR 0026). The
 * rule is checked here because the test renderer does not reproduce it.
 */
describe('screen declaration order', () => {
  it.each([
    ['root', join(APP_DIR, '_layout.tsx'), APP_DIR],
    ['(app)', join(APP_DIR, '(app)', '_layout.tsx'), join(APP_DIR, '(app)')],
    [
      '(app)/(tabs)',
      join(APP_DIR, '(app)', '(tabs)', '_layout.tsx'),
      join(APP_DIR, '(app)', '(tabs)'),
    ],
    ['(legal)', join(APP_DIR, '(legal)', '_layout.tsx'), join(APP_DIR, '(legal)')],
  ])('%s declares every route, in the order Expo Router sorts them', (_label, layout, dir) => {
    expect(declaredScreens(layout)).toEqual(expoRouterOrder(routeNames(dir)));
  });

  it('knows the rule from what was observed on a device', () => {
    expect(expoRouterOrder(['index', 'my-walks', 'profile'])).toEqual([
      'index',
      'profile',
      'my-walks',
    ]);
  });
});
