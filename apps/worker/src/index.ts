import { bootstrapState } from '@ask-bill/core';

/** No ingestion or background processing begins until jobs are implemented. */
export const workerBootstrap = bootstrapState('worker');
