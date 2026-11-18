import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { enumValues, type ReportType } from '@/api/enums';
import { errorMessage } from '@/api/errors';
import { useCreateReport } from '@/api/reports';
import type { CreateReportRequest } from '@/api/types';
import {
  Banner,
  Button,
  ChoiceGroup,
  EmptyState,
  FieldAnchor,
  Screen,
  Text,
  TextField,
  useScrollToFirstError,
} from '@/components';
import {
  limits,
  reportFields,
  serverFieldErrors,
  validateReport,
  type FieldErrors,
  type ReportFormValues,
} from '@/lib/forms';
import { isReportKind, type ReportKind } from '@/lib/report';
import { enumLabel, format, t } from '@/strings';
import { useTheme } from '@/theme';

const subjectText: Record<ReportKind, string> = {
  user: t.report.subjectUser,
  dog: t.report.subjectDog,
  walk: t.report.subjectWalk,
};

function targetOf(
  kind: ReportKind,
  id: string,
): Pick<CreateReportRequest, 'targetUserId' | 'targetDogId' | 'walkId'> {
  if (kind === 'user') return { targetUserId: id };
  if (kind === 'dog') return { targetDogId: id };
  return { walkId: id };
}

/** One report screen for a person, a dog or a walk, opened with the target already filled in. */
export default function ReportScreen() {
  const { kind, id, name } = useLocalSearchParams<{ kind: string; id: string; name: string }>();

  if (!isReportKind(kind) || !id) {
    return (
      <Screen scroll={false}>
        <EmptyState icon="info" title={t.errors.notFound} />
      </Screen>
    );
  }
  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: t.report.title }} />
      <ReportForm kind={kind} id={id} name={name ?? ''} />
    </Screen>
  );
}

function ReportForm({ kind, id, name }: { kind: ReportKind; id: string; name: string }) {
  const { spacing } = useTheme();
  const router = useRouter();
  const create = useCreateReport();
  const [values, setValues] = useState<ReportFormValues>({ type: null, facts: '' });
  const [errors, setErrors] = useState<FieldErrors<keyof ReportFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const scrollToFirstError = useScrollToFirstError();

  const typeOptions = enumValues.ReportType.map((value) => ({
    value: value as ReportType,
    label: enumLabel('ReportType', value),
  }));

  async function submit() {
    const found = validateReport(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      void scrollToFirstError(found);
      return;
    }
    try {
      await create.mutateAsync({
        type: values.type!,
        facts: values.facts.trim(),
        ...targetOf(kind, id),
      });
      setSent(true);
    } catch (error) {
      const fieldErrors = serverFieldErrors(error, reportFields);
      setErrors(fieldErrors);
      setFormError(errorMessage(error));
      void scrollToFirstError(fieldErrors);
    }
  }

  if (sent) {
    return (
      <EmptyState
        icon="info"
        title={t.report.sentTitle}
        message={t.report.sentMessage}
        action={{ label: t.report.done, onPress: () => router.back() }}
      />
    );
  }

  return (
    <>
      <Text variant="heading">{format(subjectText[kind], { name })}</Text>
      <Banner tone="info" message={t.report.explanation} />
      <FieldAnchor name="type" style={{ gap: spacing.sm }}>
        <Text variant="label">{t.report.type}</Text>
        <ChoiceGroup
          accessibilityLabel={t.report.type}
          options={typeOptions}
          value={values.type}
          onChange={(type) => {
            setValues((current) => ({ ...current, type }));
            setErrors((current) => ({ ...current, type: undefined }));
          }}
        />
        {errors.type ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {errors.type}
          </Text>
        ) : null}
      </FieldAnchor>
      <TextField
        name="facts"
        label={t.report.facts}
        value={values.facts}
        onChangeText={(facts) => {
          setValues((current) => ({ ...current, facts }));
          setErrors((current) => ({ ...current, facts: undefined }));
        }}
        error={errors.facts}
        hint={t.report.factsHint}
        maxLength={limits.reportFacts}
        multiline
      />
      {formError ? (
        <Text color="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <View>
        <Button label={t.report.submit} loading={create.isPending} onPress={submit} />
      </View>
    </>
  );
}
