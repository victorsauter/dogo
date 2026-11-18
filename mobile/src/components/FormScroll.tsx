import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
  type RefObject,
} from 'react';
import { View, type ScrollViewInstance, type ViewInstance, type ViewProps } from 'react-native';

/** Measures the vertical position of a field inside the scroll content; `null` if unknown. */
export type FieldMeasurer = () => Promise<number | null>;

/** Space kept above the field scrolled to, so its label stays visible. */
const SCROLL_MARGIN = 24;
const MEASURE_TIMEOUT_MS = 500;

/**
 * Registry of the fields of a form, by name, and the logic that picks the
 * first one in error (the highest on screen). Kept free of React for tests.
 */
export function createFieldRegistry() {
  const fields = new Map<string, FieldMeasurer>();
  return {
    register(name: string, measure: FieldMeasurer) {
      fields.set(name, measure);
      return () => {
        if (fields.get(name) === measure) fields.delete(name);
      };
    },
    /** Offset to scroll to for the first field in error, or `null` when none is registered. */
    async firstErrorOffset(errors: Record<string, unknown>): Promise<number | null> {
      const names = Object.keys(errors).filter((name) => Boolean(errors[name]));
      const positions = await Promise.all(
        names.map((name) => fields.get(name)?.() ?? Promise.resolve(null)),
      );
      const known = positions.filter((y): y is number => y !== null);
      if (known.length === 0) return null;
      return Math.max(0, Math.min(...known) - SCROLL_MARGIN);
    },
  };
}

type FieldRegistry = ReturnType<typeof createFieldRegistry>;

interface FormScrollContextValue {
  registry: FieldRegistry;
  scrollRef: RefObject<ScrollViewInstance | null>;
}

const FormScrollContext = createContext<FormScrollContextValue | null>(null);

/** Provided by `Screen` around its scroll view. */
export function FormScrollProvider({
  scrollRef,
  children,
}: PropsWithChildren<{ scrollRef: RefObject<ScrollViewInstance | null> }>) {
  const registry = useMemo(() => createFieldRegistry(), []);
  const value = useMemo(() => ({ registry, scrollRef }), [registry, scrollRef]);
  return <FormScrollContext.Provider value={value}>{children}</FormScrollContext.Provider>;
}

/**
 * Returns a function that scrolls the screen to the first field in error.
 * Call it with the form's errors after a failed validation (client or server):
 * `scrollToFirstError(errors)`. Does nothing outside a scrolling `Screen`.
 */
export function useScrollToFirstError() {
  const context = useContext(FormScrollContext);
  return useCallback(
    async (errors: Record<string, unknown>) => {
      if (!context) return;
      const y = await context.registry.firstErrorOffset(errors);
      if (y !== null) context.scrollRef.current?.scrollTo({ y, animated: true });
    },
    [context],
  );
}

export interface FieldAnchorProps extends ViewProps {
  /** Name of the field in the form's errors (`title`, `allowedSizes`…). */
  name?: string;
}

/**
 * Wraps a form field so `useScrollToFirstError()` can find it. `TextField` and
 * `DateField` use it through their `name` prop; wrap other fields (chip groups,
 * map pickers) directly.
 */
export function FieldAnchor({ name, children, ...props }: PropsWithChildren<FieldAnchorProps>) {
  const context = useContext(FormScrollContext);
  const ref = useRef<ViewInstance>(null);

  useEffect(() => {
    if (!context || !name) return;
    return context.registry.register(
      name,
      () =>
        new Promise((resolve) => {
          // Never leave the caller waiting if the native side does not answer.
          const timeout = setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS);
          const done = (y: number | null) => {
            clearTimeout(timeout);
            resolve(y);
          };
          const field = ref.current;
          const content = context.scrollRef.current?.getInnerViewRef?.();
          if (!field || !content) return done(null);
          field.measureLayout(
            content,
            (_x: number, y: number) => done(y),
            () => done(null),
          );
        }),
    );
  }, [context, name]);

  return (
    <View ref={ref} collapsable={false} {...props}>
      {children}
    </View>
  );
}
