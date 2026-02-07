import type { Container } from '../../core/container.js';
import { colors } from '../ui.js';

export async function configCommand(container: Container, key?: string, value?: string): Promise<void> {
  if (!key) {
    // Show current config (redact sensitive values)
    const config = { ...container.config };
    const display = {
      ...config,
      apiKey: config.apiKey ? '****' : '(not set)',
    };
    console.log(JSON.stringify(display, null, 2));
    return;
  }

  if (!value) {
    // Show specific key
    const val = (container.config as unknown as Record<string, unknown>)[key];
    if (val !== undefined) {
      console.log(`${key}: ${JSON.stringify(val)}`);
    } else {
      console.log(colors.warn(`Config key '${key}' not found`));
    }
    return;
  }

  console.log(colors.dim('Config update via CLI not yet implemented. Edit config.json directly.'));
}
