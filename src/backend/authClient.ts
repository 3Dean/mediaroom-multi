import { ensureAmplifyConfigured } from './amplifyClient';

export async function signUpWithEmail(email: string, password: string) {
  await ensureAmplifyConfigured();
  const { signUp } = await import('aws-amplify/auth');
  return await signUp({
    username: email,
    password,
  });
}

export async function confirmSignUpWithEmail(email: string, code: string): Promise<void> {
  await ensureAmplifyConfigured();
  const { confirmSignUp } = await import('aws-amplify/auth');
  await confirmSignUp({
    username: email,
    confirmationCode: code,
  });
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await ensureAmplifyConfigured();
  const { signIn } = await import('aws-amplify/auth');
  await signIn({
    username: email,
    password,
  });
}

export async function getAuthenticatedUser() {
  try {
    await ensureAmplifyConfigured();
    const { getCurrentUser } = await import('aws-amplify/auth');
    return await getCurrentUser();
  } catch {
    return null;
  }
}

export async function getRealtimeAuthToken(): Promise<string | null> {
  try {
    await ensureAmplifyConfigured();
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? session.tokens?.accessToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export async function signOutCurrentUser(): Promise<void> {
  await ensureAmplifyConfigured();
  const { signOut } = await import('aws-amplify/auth');
  await signOut();
}
