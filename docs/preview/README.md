# Ask Bill local reader preview

The AB-004 local preview is a deliberately limited, offline demonstration, not the public Ask Bill release.

## Run

With Node 24.19.0 / pnpm 10.18.1 and the workspace installed:

```sh
pnpm preview
```

Open `http://127.0.0.1:4100/` in a browser. To change the loopback port, set `PORT` to an integer from 1 to 65535. Only loopback connections are accepted; there is no public deployment in this unit.

The source comes from `fixtures/electronic-filing-excerpt.json`, an incomplete, nonpublishable draft passage. The server refuses to display it if its incomplete/fixture-only flags are removed. All questions are prewritten local demonstrations; free-input is disabled. No service provider, identity, microphone, recording or storage is connected.

Tests: `node --test tests/preview.test.mjs`. Full browser accessibility audits, final React/Next interface and real character production remain future acceptance gates.
