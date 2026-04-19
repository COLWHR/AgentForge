import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPythonPath, getPythonCommand, getViteArgs } from './dev-with-token.mjs';

test('getPythonCommand uses python on Windows', () => {
  assert.equal(getPythonCommand('win32'), 'python');
});

test('getPythonCommand uses python3 on non-Windows platforms', () => {
  assert.equal(getPythonCommand('linux'), 'python3');
});

test('buildPythonPath prepends repo root and preserves existing PYTHONPATH', () => {
  assert.equal(buildPythonPath('D:/repo', 'A;B', 'win32'), 'D:/repo;A;B');
  assert.equal(buildPythonPath('/repo', '/usr/lib', 'linux'), '/repo:/usr/lib');
  assert.equal(buildPythonPath('/repo', '', 'linux'), '/repo');
});

test('getViteArgs forwards extra dev-server arguments', () => {
  assert.deepEqual(getViteArgs(['--host', '0.0.0.0', '--port', '4173']), [
    'vite',
    '--host',
    '0.0.0.0',
    '--port',
    '4173',
  ]);
});
