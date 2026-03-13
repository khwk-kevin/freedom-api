/**
 * Freedom World App Builder — Iteration Mode
 * Adapted: imports use relative paths.
 */

import { loadMerchantApp, saveMerchantApp, commitVaultToGit } from './persistence';
import {
  restartBuilderService,
  waitForServiceReady,
  getServiceDevUrl,
  stopBuilderService,
} from './railway';
import type { MerchantAppSpec } from './types';

// ============================================================
// START ITERATION SESSION
// ============================================================

export async function startIterationSession(
  merchantId: string
): Promise<{ devUrl: string; spec: MerchantAppSpec }> {
  const spec = await loadMerchantApp(merchantId);
  if (!spec) {
    throw new Error(`No app found for merchant ${merchantId}`);
  }

  const { railwayServiceId } = spec;
  if (!railwayServiceId) {
    throw new Error(
      `Merchant ${merchantId} has no Railway service ID — provisioning may not have completed`
    );
  }

  await restartBuilderService(railwayServiceId);

  const ready = await waitForServiceReady(railwayServiceId, 30_000);
  if (!ready) {
    throw new Error(
      `Builder service for merchant ${merchantId} did not become ready within 30 seconds`
    );
  }

  const devUrl = await getServiceDevUrl(railwayServiceId);

  const updatedSpec: MerchantAppSpec = {
    ...spec,
    status: 'iterating',
    updatedAt: new Date().toISOString(),
  };

  await saveMerchantApp(merchantId, updatedSpec);

  return { devUrl, spec: updatedSpec };
}

// ============================================================
// END ITERATION SESSION
// ============================================================

export async function endIterationSession(merchantId: string): Promise<void> {
  const spec = await loadMerchantApp(merchantId);
  if (!spec) {
    throw new Error(`No app found for merchant ${merchantId}`);
  }

  const { railwayProjectId, railwayServiceId } = spec;
  if (!railwayProjectId || !railwayServiceId) {
    throw new Error(
      `Merchant ${merchantId} is missing Railway project/service IDs`
    );
  }

  await commitVaultToGit(
    railwayProjectId,
    railwayServiceId,
    'iteration: save changes'
  );

  await stopBuilderService(railwayServiceId);

  const updatedSpec: MerchantAppSpec = {
    ...spec,
    status: 'deployed',
    updatedAt: new Date().toISOString(),
  };
  await saveMerchantApp(merchantId, updatedSpec);
}
