# AB-004: Read-only reader shutdown

Idempotent drain stops accepting new public requests and exposes counters without personal content. Existing reads retain their slots; idle sockets close. The supervisor must enforce a hard deadline on upstream lookups that never settle. CI unit and browser tests are required before merge. Full staging load tests remain pending.
