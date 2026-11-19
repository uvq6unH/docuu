import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}
