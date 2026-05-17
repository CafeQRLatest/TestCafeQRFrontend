import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['next', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NEXT_PUBLIC_NATIVE_BUILD: 'true',
  },
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
