# QA workflow

The QA layer is intentionally split into three scripts:

- `./qa/smoke.sh` runs the Zig helper tests and, when available, probes the
  CLI binary.
- `./qa/regression.sh` verifies the fixture corpus and, when `GINGA_BIN` is
  available, golden PNG/JPEG round trips and preview output via SHA-256.
- `./qa/bench.sh` runs a command repeatedly and reports average wall-clock
  time.

## Conventions

- Keep fixtures tiny and deterministic.
- Add new regression assets under `fixtures/`.
- Use `GINGA_BIN` to point the scripts at a built CLI once the build graph is
  wired.
