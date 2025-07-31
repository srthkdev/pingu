import { Command } from '../discord-client';
import { monitorCommand } from './monitor';
import { subscriptionsCommand } from './subscriptions';
import { unsubscribeCommand } from './unsubscribe';
import { authCommand } from './auth';

// Export all commands for easy registration
export const commands: Command[] = [
  monitorCommand,
  subscriptionsCommand,
  unsubscribeCommand,
  authCommand
];

// Export individual commands for direct access if needed
export {
  monitorCommand,
  subscriptionsCommand,
  unsubscribeCommand,
  authCommand
};