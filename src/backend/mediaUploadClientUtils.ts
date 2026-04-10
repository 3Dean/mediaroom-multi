import { Sha256 } from '@aws-crypto/sha256-js';

export async function computeFileChecksum(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const webCrypto = globalThis.crypto;
  if (webCrypto?.subtle?.digest) {
    const digest = await webCrypto.subtle.digest('SHA-256', buffer);
    return toHex(new Uint8Array(digest));
  }

  const hasher = new Sha256();
  hasher.update(new Uint8Array(buffer));
  const digest = await hasher.digest();
  return toHex(digest instanceof Uint8Array ? digest : new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function uploadAuthorizedFile(file: File, uploadUrl: string, uploadHeaders: Record<string, string> | undefined): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      ...(uploadHeaders ?? {}),
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}.`);
  }
}
