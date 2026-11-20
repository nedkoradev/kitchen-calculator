import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPilotHost} from '../rollout-preflight/stage-server.mjs';

test('Pilot candidate tag is allowed for pre-traffic smoke, without relaxing arbitrary hosts', () => {
 const origin = 'https://nediq-v3-pilot-579302190437.europe-west1.run.app';
 assert.equal(allowedPilotHost(new URL(origin).host, origin), true);
 assert.equal(allowedPilotHost('candidate---nediq-v3-pilot-inu5wh5ola-ew.a.run.app', origin), true);
 assert.equal(allowedPilotHost('evil.example.com', origin), false);
 assert.equal(allowedPilotHost('other---nediq-v3-pilot-inu5wh5ola-ew.a.run.app', origin), false);
 assert.equal(allowedPilotHost('candidate---other-service-inu5wh5ola-ew.a.run.app', origin), false);
 assert.equal(allowedPilotHost('candidate---nediq-v3-pilot-inu5wh5ola-ew.a.run.app.evil.test', origin), false);
});
