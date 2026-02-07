import { execaCommand } from 'execa';
import { BunFileSystem } from '../../core/fs.js';
import { loadCredentials } from '../../auth/credentials.js';
import { validateApiKey } from '../../auth/validator.js';
import { colors } from '../ui.js';

interface Check {
  name: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
}

export async function doctorCommand(): Promise<void> {
  console.log(colors.brand('ValarMind Doctor\n'));

  const checks: Check[] = [];
  const fs = new BunFileSystem();

  // Bun version
  try {
    const { stdout } = await execaCommand('bun --version');
    checks.push({ name: 'Bun', status: 'ok', message: `v${stdout.trim()}` });
  } catch {
    checks.push({ name: 'Bun', status: 'error', message: 'Not found' });
  }

  // Git
  try {
    const { stdout } = await execaCommand('git --version');
    checks.push({ name: 'Git', status: 'ok', message: stdout.trim() });
  } catch {
    checks.push({ name: 'Git', status: 'warn', message: 'Not found (optional)' });
  }

  // ripgrep
  try {
    const { stdout } = await execaCommand('rg --version');
    const version = stdout.split('\n')[0] ?? 'found';
    checks.push({ name: 'ripgrep', status: 'ok', message: version });
  } catch {
    checks.push({ name: 'ripgrep', status: 'warn', message: 'Not found (grep fallback)' });
  }

  // API key
  const key = await loadCredentials(fs);
  if (key) {
    const result = await validateApiKey(key);
    if (result.ok) {
      checks.push({ name: 'API Key', status: 'ok', message: 'Valid' });
    } else {
      checks.push({ name: 'API Key', status: 'error', message: result.error });
    }
  } else {
    checks.push({ name: 'API Key', status: 'error', message: 'Not configured' });
  }

  // VALARMIND.md
  if (await fs.exists('VALARMIND.md')) {
    checks.push({ name: 'VALARMIND.md', status: 'ok', message: 'Found' });
  } else {
    checks.push({ name: 'VALARMIND.md', status: 'warn', message: 'Not found (run /init)' });
  }

  // Display results
  for (const check of checks) {
    const icon =
      check.status === 'ok' ? colors.success('✓') :
      check.status === 'warn' ? colors.warn('!') :
      colors.error('✗');
    console.log(`  ${icon} ${check.name.padEnd(15)} ${check.message}`);
  }

  const errors = checks.filter((c) => c.status === 'error');
  console.log('');
  if (errors.length === 0) {
    console.log(colors.success('Tudo ok!'));
  } else {
    console.log(colors.warn(`${errors.length} problema(s) encontrado(s).`));
  }
}
