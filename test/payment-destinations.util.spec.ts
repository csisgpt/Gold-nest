import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  decryptDestinationValue,
  encryptDestinationValue,
  hashDestinationValue,
  maskDestinationValue,
  normalizeDestinationValue,
} from '../src/modules/payment-destinations/payment-destinations.crypto';

test('normalizeDestinationValue strips spaces/dashes and uppercases', () => {
  assert.equal(normalizeDestinationValue('IR12 3456-7890'), 'IR1234567890');
});

test('maskDestinationValue keeps last 4 digits', () => {
  assert.equal(maskDestinationValue('IR1234567890'), '****7890');
});

test('hashDestinationValue is deterministic for normalized value', () => {
  const value = normalizeDestinationValue('ir12 3456-7890');
  const hashA = hashDestinationValue(value);
  const hashB = hashDestinationValue(value);
  assert.equal(hashA, hashB);
});

test('encrypt/decrypt roundtrip for destination value', () => {
  const value = normalizeDestinationValue('IR1234567890');
  const encrypted = encryptDestinationValue(value);
  const decrypted = decryptDestinationValue(encrypted);
  assert.equal(decrypted, value);
});
