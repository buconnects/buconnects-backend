import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRole, canAccessSection, canCreateContent } from '../src/utils/roles.js';

test('role normalization handles case and aliases', () => {
  assert.equal(normalizeRole('admin'), 'ADMIN');
  assert.equal(normalizeRole('Developer'), 'DEVELOPER');
  assert.equal(normalizeRole('user'), 'USER');
});

test('users can access personal sections but not admin managed content', () => {
  assert.equal(canAccessSection('USER', 'dashboard'), true);
  assert.equal(canAccessSection('USER', 'market'), true);
  assert.equal(canAccessSection('USER', 'admin'), false);
  assert.equal(canCreateContent('USER', 'market'), false);
  assert.equal(canCreateContent('USER', 'updates'), false);
});

test('admins and developers can publish campus content', () => {
  assert.equal(canCreateContent('ADMIN', 'market'), true);
  assert.equal(canCreateContent('ADMIN', 'updates'), true);
  assert.equal(canCreateContent('ADMIN', 'events'), true);
  assert.equal(canCreateContent('DEVELOPER', 'market'), true);
  assert.equal(canAccessSection('DEVELOPER', 'admin'), true);
});
