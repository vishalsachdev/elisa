import type { Portal } from './types';

let currentPortals: Portal[] = [];

export function updatePortalOptions(portals: Portal[]): void {
  currentPortals = portals;
}

export function getCurrentPortals(): Portal[] {
  return currentPortals;
}
