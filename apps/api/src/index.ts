import { bootstrapState } from '@ask-bill/core';

/** No public HTTP endpoint or provider request is enabled in the scaffold. */
export const apiBootstrap = bootstrapState('api');

// API and browser import one independently owned, versioned validator.
export { parseAnswerEvent as parseApiEvent, verifySourceSpan as verifyApiCitation } from '@ask-bill/contracts';
