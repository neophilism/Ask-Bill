# Official Congress.gov metadata connector — AB-020

The independent Ask Bill product uses the Library of Congress Congress.gov API v3. Official API docs: https://api.congress.gov/ and https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/BillEndpoint.md.

The server-only client supports GET bill identity and bill-text version metadata, exact congress/type/number validation, version keys derived from authoritative metadata, API-level ETags, bounded pagination, 429/503 backoff, redirection refusal and strict HTTPS official format-link allowlisting. It passes the API credential only in the X-Api-Key header, never a URL, browser or error message. Per-instance quota defaults to 4,000 requests/hour versus the documented Congress.gov 5,000/hour limit; real deployments also require shared persistent quotas across instances.

A "latestAction" is not proof of enactment/effectiveness; the connector emits lawStatus "unknown" and an absent effective date until AB-021 verifies independent authoritative evidence. A text version's official format URL is **metadata only**, never automatic trusted/executed source bytes. Downloads must pass authenticated provenance and the standalone, network-denied intake pipeline. No arbitrary redirect or private network is followed.

No Congress.gov API key is present in this repository. Current tests use injected deterministic fixtures, including malformed IDs, off-origin formats, injection strings, pagination, ETag, retry and response limits. A genuine credentialed staging re-import and comparison against Congressional records remain required for full AB-020 operational acceptance. Neither a passed fixture test nor parsed metadata is an official complete bill release.

Rollback: disable the connector and retain the last independently verified source version and retrieval timestamp, with a stale-data warning.
