# AB-091 exact text search (partial)

Native HTML no-JavaScript search of one complete, trusted published bill version. Strict query length, canonical source integrity, ASCII-only case folding so Unicode offsets do not shift, bounded results, escaped HTML, exact hash/citation links, and fail-closed mismatch handling. The server does not persist the search query, although GET query strings are visible in browser history and may be logged by hosting infrastructure. Do not type sensitive personal details.

Tests: `node --test tests/public-reader-search.test.mjs` and existing full CI. Scope remains partial: user bookmarks, print polish, selected-text interactions and history are future work. The first public website and full law source authenticity still require production verification. Rollback disables the search endpoint/form without source mutations.
