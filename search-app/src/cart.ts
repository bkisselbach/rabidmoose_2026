import { buildCart } from '@coveo/headless/commerce';
import { commerceEngine } from './commerceEngine';
import { saveCartItems } from './lib/cartStorage';

export const cart = buildCart(commerceEngine);
cart.subscribe(() => saveCartItems(cart.state.items));
