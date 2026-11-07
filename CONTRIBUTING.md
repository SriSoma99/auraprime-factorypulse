# Contributing

Thanks for your interest in AuraPrime FactoryPulse.

## Licence and sign-off

Contributions are accepted under the Apache License 2.0, the same licence as the project. Sign off each commit to certify the [Developer Certificate of Origin](https://developercertificate.org/):

```bash
git commit -s -m "fix(ingest): reject envelopes without a tenant ID"
```

## Before you open a pull request

1. Read [`doc/README.md`](doc/README.md). Design decisions live in `doc/`; a change that alters a decision updates the document and, if needed, adds an ADR.
2. Run `pnpm typecheck` and `pnpm test` locally with the stack up (`pnpm local:up`, `pnpm db:reset`).
3. Keep values in configuration: thresholds, timeouts, ports, topic names, model IDs and labels are schema-validated keys (`packages/config`), not literals.
4. Use synthetic data only. Never add real plant, employer, client or personal data.

## Safety invariants

These are never configurable and never weakened. Pull requests that loosen one will not be merged.

1. No tool may actuate equipment; work-order tools are draft only.
2. Approval requires a human session; API keys and agent tokens cannot approve.
3. Only the audit writer appends to the hash-chained audit log.
4. Every tenant record, event and query carries a tenant ID; row-level security stays on.
5. Alerts are never dropped under back-pressure.
6. The real-time alert path never calls an LLM or MCP.
7. Secrets never come from config files or repositories.
