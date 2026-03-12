/**
 * Connector registry — central access point for all external app connectors.
 */

import type { AppConnector } from "./types";
import { UniAssistConnector } from "./uniassist";
import { TestPrepConnector } from "./testprep";

const connectors: Record<string, AppConnector> = {
  uniassist: new UniAssistConnector(),
  testprep: new TestPrepConnector(),
};

/** Get a connector by app name. Returns undefined if not registered. */
export function getConnector(name: string): AppConnector | undefined {
  return connectors[name.toLowerCase()];
}

/** List all registered connector names. */
export function listConnectors(): string[] {
  return Object.keys(connectors);
}

/** Check which connectors are currently available (API reachable). */
export async function getAvailableConnectors(): Promise<string[]> {
  const results = await Promise.all(
    Object.entries(connectors).map(async ([name, connector]) => ({
      name,
      available: await connector.isAvailable(),
    })),
  );
  return results.filter(r => r.available).map(r => r.name);
}
