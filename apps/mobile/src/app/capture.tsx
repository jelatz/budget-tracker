import { useLocalSearchParams } from 'expo-router';
import { transactionTypeSchema } from '@repo/contracts';
import { CaptureScreen } from '@/features/transactions/screens/capture-screen';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim() || undefined;
  return undefined;
}

export default function CaptureRoute() {
  const params = useLocalSearchParams<{
    editId?: string | string[];
    initialType?: string | string[];
  }>();

  const rawInitialType = firstParam(params.initialType);
  const parsedType = rawInitialType ? transactionTypeSchema.safeParse(rawInitialType) : null;

  return (
    <CaptureScreen
      editId={firstParam(params.editId)}
      initialType={parsedType?.success ? parsedType.data : undefined}
    />
  );
}
