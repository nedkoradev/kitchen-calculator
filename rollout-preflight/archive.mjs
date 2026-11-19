import {createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync} from 'node:crypto';
import {open, link, unlink} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';

const format = 'ned-iq-pilot-backup';
const limit = 64 * 1024 * 1024;
const aad = Buffer.from(format + ':1');
const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
const keyFor = (secret, salt) => {
  if (secret.length < 20) throw new Error('Use a strong archive passphrase of at least 20 bytes');
  return scryptSync(secret, salt, 32, {N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024});
};

export async function readLocalFile(path, maxBytes = limit) {
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes) throw new Error('Expected a regular local file within the archive limit');
    const bytes = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const {bytesRead} = await handle.read(bytes, length, bytes.length - length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== info.size) throw new Error('Input file changed while being read');
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

export function protectCopy(bytes, secret) {
  if (!bytes.length || bytes.length > limit) throw new Error('Copy outside the archive limit');
  const input = JSON.parse(bytes.toString('utf8'));
  if (!input || typeof input !== 'object' || Array.isArray(input) || !input.ownerUid ||
    !['projects', 'cabinets', 'folders', 'drafts'].every(key => Array.isArray(input[key]))) {
    throw new Error('Invalid pilot copy format');
  }
  const manifest = {format, version: 1, createdAt: new Date().toISOString(),
    source: {bytes: bytes.length, sha256: checksum(bytes)},
    counts: Object.fromEntries(['projects', 'cabinets', 'folders', 'drafts'].map(key => [key, input[key].length]))};
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = keyFor(secret, salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const manifestJson = Buffer.from(JSON.stringify(manifest) + '\n');
    const ciphertext = Buffer.concat([cipher.update(manifestJson), cipher.update(bytes), cipher.final()]);
    return Buffer.from(JSON.stringify({format, version: 1, salt: salt.toString('base64'),
      iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64')}));
  } finally { key.fill(0); }
}

export function verifyCopy(encrypted, secret) {
  const envelope = JSON.parse(encrypted.toString('utf8'));
  if (envelope?.format !== format || envelope.version !== 1) throw new Error('Unknown archive format');
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || ciphertext.length > limit + 4096) {
    throw new Error('Invalid encryption envelope');
  }
  const key = keyFor(secret, salt);
  let plain;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const split = plain.indexOf(10);
    if (split < 1 || split > 4096) throw new Error('Invalid archive manifest');
    const manifest = JSON.parse(plain.subarray(0, split));
    const bytes = plain.subarray(split + 1);
    if (manifest.format !== format || manifest.version !== 1 ||
        manifest.source.bytes !== bytes.length || manifest.source.sha256 !== checksum(bytes)) {
      throw new Error('Copy hash does not match the manifest');
    }
    return {manifest, bytes: Buffer.from(bytes)};
  } finally {
    key.fill(0);
    plain?.fill(0);
  }
}

// Publish by linking only after bytes are synced. Existing backups are never overwritten.
export async function writeNewLocalFile(path, bytes) {
  const temporary = join(dirname(path), '.' + basename(path) + '.' + randomBytes(12).toString('hex'));
  const file = await open(temporary, 'wx', 0o600);
  try {
    try { await file.writeFile(bytes); await file.sync(); }
    finally { await file.close(); }
    await link(temporary, path);
  } finally { await unlink(temporary); }
}
