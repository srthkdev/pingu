import { ButtonHandler, SelectMenuHandler } from '../discord-client';
import { 
  confirmLabelSelectionHandler, 
  cancelLabelSelectionHandler, 
  labelSelectMenuHandler,
  refreshLabelsHandler 
} from './label-selection';
import {
  viewSubscriptionDetailsHandler,
  removeSubscriptionSelectHandler,
  confirmSubscriptionRemovalHandler,
  cancelSubscriptionRemovalHandler,
  addMoreLabelsHandler,
  manageSubscriptionsHandler,
  refreshSubscriptionDetailsHandler
} from './subscription-management';

// Export all button handlers
export const buttonHandlers: ButtonHandler[] = [
  confirmLabelSelectionHandler,
  cancelLabelSelectionHandler,
  refreshLabelsHandler,
  viewSubscriptionDetailsHandler,
  confirmSubscriptionRemovalHandler,
  cancelSubscriptionRemovalHandler,
  addMoreLabelsHandler,
  manageSubscriptionsHandler,
  refreshSubscriptionDetailsHandler
];

// Export all select menu handlers
export const selectMenuHandlers: SelectMenuHandler[] = [
  labelSelectMenuHandler,
  removeSubscriptionSelectHandler
];

// Export individual handlers for direct access if needed
export {
  confirmLabelSelectionHandler,
  cancelLabelSelectionHandler,
  labelSelectMenuHandler,
  refreshLabelsHandler,
  viewSubscriptionDetailsHandler,
  removeSubscriptionSelectHandler,
  confirmSubscriptionRemovalHandler,
  cancelSubscriptionRemovalHandler,
  addMoreLabelsHandler,
  manageSubscriptionsHandler,
  refreshSubscriptionDetailsHandler
};