export async function computeFileChecksum(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
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
