import {readFileSync} from 'node:fs';
import {protectCopy, readLocalFile, verifyCopy, writeNewLocalFile} from './archive.mjs';

const [command, source, destination] = process.argv.slice(2);
if (!['pack', 'verify', 'unpack'].includes(command) || !source || (command === 'verify' ? !!destination : !destination)) {
  process.stderr.write('Usage: node rollout-preflight/backup.mjs pack|verify|unpack local-source [local-destination] (passphrase on fd 3)\n');
  process.exitCode = 2;
} else {
  let secret;
  let bytes;
  let restored;
  try {
    secret = readFileSync(3);
    while (secret.at(-1) === 10 || secret.at(-1) === 13) secret = secret.subarray(0, -1);
    bytes = await readLocalFile(source, command === 'pack' ? undefined : 90 * 1024 * 1024);
    if (command === 'pack') {
      const encrypted = protectCopy(bytes, secret);
      await writeNewLocalFile(destination, encrypted);
      console.log('Encrypted local copy created; verify separately.');
    } else {
      const result = verifyCopy(bytes, secret);
      restored = result.bytes;
      if (command === 'unpack') await writeNewLocalFile(destination, restored);
      console.log(JSON.stringify(result.manifest, null, 2));
    }
  } catch {
    // Files and passphrases may be sensitive. Never log inputs or parse errors.
    process.stderr.write('Local backup operation failed. Check file format, permissions, passphrase and destination.\n');
    process.exitCode = 1;
  } finally {
    secret?.fill(0);
    bytes?.fill(0);
    restored?.fill(0);
  }
}
