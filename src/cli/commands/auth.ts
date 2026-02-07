import * as clack from '@clack/prompts';
import { BunFileSystem } from '../../core/fs.js';
import { loadCredentials, saveCredentials, removeCredentials, maskApiKey } from '../../auth/credentials.js';
import { validateApiKey } from '../../auth/validator.js';
import { askApiKey } from '../prompts.js';
import { colors } from '../ui.js';

interface AuthOptions {
  key?: string;
  logout?: boolean;
  status?: boolean;
  validate?: boolean;
}

export async function authCommand(options: AuthOptions): Promise<void> {
  const fs = new BunFileSystem();

  if (options.logout) {
    await removeCredentials(fs);
    console.log(colors.success('Credenciais removidas.'));
    return;
  }

  if (options.status) {
    const key = await loadCredentials(fs);
    if (key) {
      console.log(`API Key: ${maskApiKey(key)}`);
      console.log(colors.success('Autenticado'));
    } else {
      console.log(colors.warn('Não autenticado. Execute: valarmind auth'));
    }
    return;
  }

  if (options.validate) {
    const key = await loadCredentials(fs);
    if (!key) {
      console.log(colors.error('Nenhuma API key encontrada.'));
      return;
    }
    const result = await validateApiKey(key);
    if (result.ok) {
      console.log(colors.success(`API key válida. ${result.value.length} modelos disponíveis.`));
    } else {
      console.log(colors.error(result.error));
    }
    return;
  }

  // Interactive auth flow or direct key
  let apiKey = options.key;

  if (!apiKey) {
    clack.intro(colors.brand('ValarMind Auth'));

    const existingKey = await loadCredentials(fs);
    if (existingKey) {
      console.log(colors.dim(`Key existente: ${maskApiKey(existingKey)}`));
      const replace = await clack.confirm({ message: 'Substituir key existente?' });
      if (clack.isCancel(replace) || !replace) {
        clack.outro('Auth cancelado.');
        return;
      }
    }

    apiKey = (await askApiKey()) ?? undefined;
    if (!apiKey) {
      clack.outro('Auth cancelado.');
      return;
    }
  }

  // Validate
  const spinner = clack.spinner();
  spinner.start('Validando API key...');

  const result = await validateApiKey(apiKey);
  if (!result.ok) {
    spinner.stop(colors.error('Key inválida'));
    console.log(colors.error(result.error));
    return;
  }

  spinner.stop(colors.success('Key válida'));

  // Save
  await saveCredentials(fs, apiKey);
  console.log(colors.success(`Salvo! ${result.value.length} modelos disponíveis.`));

  if (!options.key) {
    clack.outro('Auth configurado com sucesso!');
  }
}
