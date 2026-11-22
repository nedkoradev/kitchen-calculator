import {pathToFileURL} from 'node:url';

export function validateRollbackRevision(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Rollback mode requires rollback_revision. Enter the exact previously working revision name.');
  }
  if (!/^nediq-v3-public-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error('Invalid rollback_revision. Expected an exact nediq-v3-public revision name using lowercase letters, digits, and single hyphens.');
  }
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    validateRollbackRevision(process.env.ROLLBACK_REVISION);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
