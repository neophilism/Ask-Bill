# ADR-0001: Ask Bill's independent source-to-performance boundary

Status: Accepted for AB-003 implementation, 2026-10-16.

Ask Bill is a separate product and company. No external product/company API, SDK, service, data store or release workflow is authorized as an application dependency. The packages under `@ask-bill/*` are maintained and deployed as Ask Bill's own components.

## Trust decisions

- Source versions are immutable version IDs plus SHA-256 source and canonical-text digests; incomplete source never passes the published-version validator.
- Server-side source verification uses exact Unicode code-point offsets, quote byte equality and SHA-256 hashes against locally controlled canonical text. Structural model output alone is never accepted as grounding proof.
- Claim-kind schemas, source support, validation metadata and event version/epoch checks are shared by API and browser through `@ask-bill/contracts`.
- Presentation cues use semantic references to previously validated segments only. Coordinates, selectors, arbitrary animations, URIs and script are forbidden as model cue fields.
- Server-side publisher authorization remains a separate responsibility of AB-008: `rolePermits` is an isolated contract helper, not an authentication system.
- A character manifest is a data format and a verifier; no actual 3D model has yet been created.

## Deliberate limits

Structural validation does not prove semantic entailment or current-law accuracy. A future grounding pipeline must use `verifyValidatedSegment` plus substantive source-support checks before releasing an answer. A staged local fixture is not a complete authoritative bill. Static parser acceptance is not live API, deployed provider or source-publication acceptance.

## Rollback

Pin API and browser to the last mutually supported schema version, disable live conversation and preserve read-only source pages.
