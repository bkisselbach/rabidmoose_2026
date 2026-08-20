import { buildNotifyTrigger } from '@coveo/headless/commerce';
import { commerceEngine } from './commerceEngine';

export const notifyTrigger = buildNotifyTrigger(commerceEngine);
