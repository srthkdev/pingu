import { Command } from '../discord-client';
import { monitorCommand } from './monitor';
import { subscriptionsCommand } from './subscriptions';
import { unsubscribeCommand } from './unsubscribe';
import { authCommand } from './auth';
import { diagnosticsCommand } from './diagnostics';

// Export all commands for easy registration
export const commands: Command[] = [
  monitorCommand,
  subscriptionsCommand,
  unsubscribeCommand,
  authCommand,
  diagnosticsCommand
];

// Export individual commands for direct access if needed
export {
  monitorCommand,
  subscriptionsCommand,
  unsubscribeCommand,
  authCommand,
  diagnosticsCommand
};