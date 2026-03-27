import { Amplify } from 'aws-amplify';

let isConfigured = false;

export function configureAmplify(outputs?: Record<string, unknown>): void {
  if (!outputs || isConfigured) {
    return;
  }

  Amplify.configure(outputs);
  isConfigured = true;
}
