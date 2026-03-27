import { getCurrentUser, signIn, signOut, signUp } from 'aws-amplify/auth';

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  await signUp({
    username: email,
    password,
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

export async function signOutCurrentUser(): Promise<void> {
  await signOut();
}
