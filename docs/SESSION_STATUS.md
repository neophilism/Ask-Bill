# Ask Bill — latest scoped engineering checkpoint
Observed at 2026-10-16T23:51:35Z UTC from live GitHub PRs and repository source. Ask Bill is an independent company/product and never depends on another project's database or service.

## Merged and open
- PRs #1–#9 are merged and their exact-head GitHub Actions checks had passed when merged; #4–#9 are scoped foundations with production acceptance outstanding.
- PR #10 (AB-010) is open on `ab-010-durable-jobs-outbox`, initially draft: fenced tenant-scoped PostgreSQL jobs, transactional outbox, bounded retries and dead-letter diagnostics, worker orchestration and store adapter.
- The 112-unit plan and 490 original dependency edges remain intact. The registry maps ten genuine PRs, marking AB-010 in progress, not complete.
- AB-010 local Node 22 tests: **16 passed**. An ephemeral PostgreSQL/GitHub workflow on the original implementation head passed for queue+outbox migration; exact latest-head checks must still pass before merge.
- AB-011 threat model/privacy inventory is the next independently ready unit and does not require Bill's future `.blend`/`.glb` asset.

## Live availability is not implied
The available public reader is a localhost fixture preview only. There is no production hosting, fully authenticated publisher application, complete authoritative bill corpus, live model/voice adapter, or finished Bill rig/model. Job/outbox delivery is at-least-once, never cross-network exactly-once. Do not expose queue functions to untrusted roles or record raw personal data.
