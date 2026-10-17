# AB-093 Spanish interface foundation (partial)

The Ask Bill public source-only reader now links to a real Spanish **navigation interface** that continues to show the complete original-language legal text and full exact-version source links. It does not translate statutory wording or claim that a machine-translated paragraph is authoritative. The source is marked with its original `lang`, while the page's UI uses `lang=es`. The server uses the same trusted published release and returns no-index, no-store, strict no-JavaScript HTML.

The package exports a constrained two-language label catalog, with future legal translations requiring explicit version/hash/provenance review before being offered. No new third-party translator, LLM or character asset is activated. This remains partial AB-093: a complete Spanish reference tour, reviewed translations, and locale-specific grounded answers are outstanding.

Test with `node --test tests/i18n-reader.test.mjs`. Rollback disables the `es` route and link without changing the source text.
