import { confirmSignUp, fetchAuthSession, getCurrentUser, signIn, signOut, signUp } from 'aws-amplify/auth';

export async function signUpWithEmail(email: string, password: string) {
  return await signUp({
    username: email,
    password,
  });
}

export async function confirmSignUpWithEmail(email: string, code: string): Promise<void> {
  await confirmSignUp({
    username: email,
    confirmationCode: code,
  });
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signIn({
    username: email,
    password,
  });
}

export async function getAuthenticatedUser() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

export async function getRealtimeAuthToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? session.tokens?.accessToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export async function signOutCurrentUser(): Promise<void> {
  await signOut();
}
