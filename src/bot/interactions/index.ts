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
  refreshSubscriptionDetailsHandler,
  subscriptionsPaginationHandler,
  refreshSubscriptionsHandler
} from './subscription-management';
import {
  confirmAuthRemovalHandler,
  cancelAuthRemovalHandler,
  removeAuthFromStatusHandler,
  startAuthSetupHandler
} from './auth-management';

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
  refreshSubscriptionDetailsHandler,
  subscriptionsPaginationHandler,
  refreshSubscriptionsHandler,
  confirmAuthRemovalHandler,
  cancelAuthRemovalHandler,
  removeAuthFromStatusHandler,
  startAuthSetupHandler
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
  refreshSubscriptionDetailsHandler,
  subscriptionsPaginationHandler,
  refreshSubscriptionsHandler,
  confirmAuthRemovalHandler,
  cancelAuthRemovalHandler,
  removeAuthFromStatusHandler,
  startAuthSetupHandler
};