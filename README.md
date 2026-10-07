# vwl-hybrid-search

Headless hybrid search for Vanduo Web Labs. Fuzzy retrieval is Fuse.js; semantic retrieval is Transformers.js. The host injects both libraries and serves a prebuilt index.

Not published. [Labs](https://github.com/nostromo-618/labs) consumes it as a sibling (`link:../vwl-hybrid-search`).

```bash
pnpm install && pnpm build
```

Spec: [openspec/](./openspec/).

MIT — see [LICENSE](./LICENSE).
