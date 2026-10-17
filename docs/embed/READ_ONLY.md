# AB-097: opt-in read-only source iframe (partial)

The optional embed route serves only an exact complete, active published Ask Bill source release, with a host-side explicit HTTPS origin allowlist. It is disabled by default, and normal reading retains its no-frame policy. The embedded version uses strict Content Security Policy frame-ancestors, no scripts, no parent messaging, sandboxed display, and microphone/camera/geolocation restrictions. No user chats, audio, models or private publisher data are exposed.

The embedding host is a deliberate authorization decision made by the trusted source server; never infer an origin from user headers, query strings or a random website. Only source reading is included; this does NOT enable postMessage controls, microphone, publisher administration or direct navigation from a parent.

This is a partial AB-097. Actual HTTPS staging cross-origin browser checks and public publisher origin setup are still required. Node HTTP/security test: node --test tests/embed.test.mjs. Rollback drops the route and returns to the default deny-all embedding mode.
