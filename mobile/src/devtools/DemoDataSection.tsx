import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { ApiError } from '@/api/errors';
import { Avatar, Badge, Button, Card, SwitchRow, Text, TextField } from '@/components';
import { format, plural, t } from '@/strings';
import { useTheme } from '@/theme';

import {
  matchesDemoAccount,
  useDeleteDemoData,
  useDemoData,
  useGenerateDemoData,
  type DemoAccount,
  type DemoDataGeneration,
} from './demoData';

export interface DemoDataSectionProps {
  /** A sign-in is in progress: the actions wait. */
  busy: boolean;
  /** Signs in as a demo account, through the dev sign-in (`POST /auth/dev`). */
  onSignInAs: (account: { subject: string; displayName: string }) => void;
}

/**
 * Demo data on the sign-in screen (ADR 0027): its state, generate and delete,
 * then « Se connecter comme… » with the demo accounts. Only loaded when
 * `EXPO_PUBLIC_DEV_LOGIN` is `true` (see `loadDemoDataSection`).
 */
export function DemoDataSection({ busy, onSignInAs }: DemoDataSectionProps) {
  const status = useDemoData();
  const generate = useGenerateDemoData();
  const remove = useDeleteDemoData();
  const [photos, setPhotos] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const disabledOnApi = status.error instanceof ApiError && status.error.status === 404;
  const working = busy || generate.isPending || remove.isPending;
  const actionError = [generate, remove].find((mutation) => mutation.isError)?.error;
  const data = status.data;

  function startGeneration() {
    setNotice(null);
    remove.reset();
    generate.mutate(photos, { onSuccess: (result) => setNotice(generatedNotice(result)) });
  }

  function confirmRemoval() {
    setNotice(null);
    generate.reset();
    Alert.alert(t.demoData.deleteConfirmTitle, t.demoData.deleteConfirmMessage, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: () => remove.mutate(undefined, { onSuccess: () => setNotice(t.demoData.deleted) }),
      },
    ]);
  }

  return (
    <>
      <Card>
        <Text variant="subheading">{t.demoData.title}</Text>
        {disabledOnApi ? (
          <Text color="textMuted">{t.demoData.disabled}</Text>
        ) : status.isPending ? (
          <Text color="textMuted">{t.common.loading}</Text>
        ) : status.isError ? (
          <>
            <Text color="danger">{status.error.message}</Text>
            <Button
              label={t.common.retry}
              variant="secondary"
              onPress={() => void status.refetch()}
            />
          </>
        ) : (
          <>
            <Text variant="caption" color="textMuted">
              {t.demoData.hint}
            </Text>
            <Text accessibilityLiveRegion="polite">
              {data?.exists
                ? format(t.demoData.present, {
                    owners: data.counts.owners,
                    educators: data.counts.educators,
                    dogs: data.counts.dogs,
                    walks: data.counts.walks,
                    upcoming: data.counts.upcomingWalks,
                    messages: data.counts.messages,
                    photos: data.counts.photos,
                  })
                : t.demoData.none}
            </Text>
            <SwitchRow
              label={t.demoData.photos}
              description={t.demoData.photosHint}
              value={photos}
              onValueChange={setPhotos}
              disabled={working}
            />
            <Button
              label={t.demoData.generate}
              variant="secondary"
              loading={generate.isPending}
              disabled={working}
              onPress={startGeneration}
            />
            {generate.isPending ? (
              <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite">
                {t.demoData.generating}
              </Text>
            ) : data?.exists ? (
              <Text variant="caption" color="textMuted">
                {t.demoData.replaceHint}
              </Text>
            ) : null}
            {data?.exists ? (
              <Button
                label={t.demoData.delete}
                variant="danger"
                loading={remove.isPending}
                disabled={working}
                onPress={confirmRemoval}
              />
            ) : null}
            {notice ? (
              <Text color="success" accessibilityLiveRegion="polite">
                {notice}
              </Text>
            ) : null}
            {actionError ? (
              <Text color="danger" accessibilityLiveRegion="polite">
                {actionError.message}
              </Text>
            ) : null}
          </>
        )}
      </Card>

      {data?.exists ? (
        <DemoAccounts accounts={data.accounts} disabled={working} onSignInAs={onSignInAs} />
      ) : null}
    </>
  );
}

function generatedNotice(result: DemoDataGeneration): string {
  const { counts } = result;
  const done = format(t.demoData.generated, {
    accounts: counts.owners + counts.educators,
    walks: counts.walks,
    photos: result.photosStored,
  });
  return result.photosFailed > 0
    ? `${done} ${plural(t.demoData.photosFailed, result.photosFailed)}`
    : done;
}

function DemoAccounts({
  accounts,
  disabled,
  onSignInAs,
}: {
  accounts: DemoAccount[];
  disabled: boolean;
  onSignInAs: DemoDataSectionProps['onSignInAs'];
}) {
  const [query, setQuery] = useState('');
  const shown = accounts.filter((account) => matchesDemoAccount(account, query));

  return (
    <Card>
      <Text variant="subheading">{t.demoData.signInAs}</Text>
      <Text variant="caption" color="textMuted">
        {plural(t.demoData.accountCount, accounts.length)}
      </Text>
      <TextField
        label={t.demoData.search}
        placeholder={t.demoData.searchPlaceholder}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {shown.length === 0 ? (
        <Text color="textMuted">{t.demoData.noMatch}</Text>
      ) : (
        shown.map((account) => (
          <DemoAccountRow
            key={account.subject}
            account={account}
            disabled={disabled}
            onPress={() =>
              onSignInAs({ subject: account.subject, displayName: account.displayName })
            }
          />
        ))
      )}
    </Card>
  );
}

function DemoAccountRow({
  account,
  disabled,
  onPress,
}: {
  account: DemoAccount;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const educator = account.kind === 'Educator';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={format(t.demoData.signInAsA11y, { name: account.displayName })}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.md,
        backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
        opacity: disabled ? 0.6 : 1,
      })}
    >
      <Avatar name={account.displayName} photoUrl={account.photoUrl} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
            {account.displayName}
          </Text>
          {educator ? <Badge label={t.demoData.educator} tone="primary" /> : null}
        </View>
        {educator && account.organizationName ? (
          <Text variant="caption" color="primary" numberOfLines={1}>
            {account.organizationName}
          </Text>
        ) : null}
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {account.dogNames.length > 0 ? account.dogNames.join(', ') : t.demoData.noDog}
        </Text>
      </View>
    </Pressable>
  );
}
