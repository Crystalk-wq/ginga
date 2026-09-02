# ginga fixtures

This directory holds small, deterministic reference assets for QA.

The human-readable corpus uses ASCII PPM so its pixels stay stable under source
control. The QA layer also generates a deterministic PNG/JPEG sample and checks
its codec round trips and preview rendering against `golden.sha256`.

## Layout

- `rasters/` contains tiny reference images.
- `manifest.sha256` records the expected hashes of every fixture file.
- `golden.sha256` records the expected hashes of deterministic CLI outputs.
