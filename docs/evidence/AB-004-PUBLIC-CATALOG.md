# AB-004 follow-up: source-only public catalog

A new optional, read-only catalog route lists already active, complete, published bill versions. The semantic HTML is escaped, links to immutable bill/version URLs, displays a status that does not imply current legal effect, and offers bounded paginated navigation and a stylesheet without JavaScript.

The catalog handler is disabled unless a server-controlled published-catalog callback is provided. Private, draft, incomplete, cross-publisher and malformed records never render; errors produce a generic 404. No query strings, anonymous session data, AI, audio or Bill character assets are involved.

Four unit/real HTTP tests exercise publication guards, escaped titles, 2-page navigation, absent adapters, invalid page routing, and private lookup errors. This package does NOT independently authenticate release records or provide a production database/catalog service. The database callback must verify public active-release pointers and tenant scope; that wiring, live source import, production deployment and comprehensive accessibility remain unfinished.

Rollback: disable the optional catalog callback. Exact-version source reading remains available.
