let isConfigured = false;
let configurePromise: Promise<void> | null = null;

export async function ensureAmplifyConfigured(): Promise<void> {
  if (isConfigured) {
    return;
  }

  if (!configurePromise) {
    configurePromise = (async () => {
      const [{ Amplify }, { default: outputs }] = await Promise.all([
        import('aws-amplify'),
        import('../../amplify_outputs.json'),
      ]);

      Amplify.configure(outputs as Record<string, unknown>);
      isConfigured = true;
    })();
  }

  await configurePromise;
}
