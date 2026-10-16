import { bootstrapState } from '@ask-bill/core';

/** Not a routed/accessible reader yet: AB-004 owns the real public UI. */
export const webBootstrap = bootstrapState('web');

// The browser never accepts LLM-origin coordinates or out-of-version citations.
export { parseAnswerEvent as parseWebEvent, parseSemanticCue as parseWebCue } from '@ask-bill/contracts';
