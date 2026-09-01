# Candidate readiness

Run structural validation with `node .agents/skills/furniture-asset-packaging/scripts/validate_furniture_asset.mjs <id> --scope <builtin|user-generated> --candidate --out <report>`.
Run GLB validation with `node .agents/skills/furniture-asset-packaging/scripts/smoke_export_glb.mjs <id> --scope <builtin|user-generated> --out <report>`.

Inspect the portable material path and compare source/export-reload appearance. When both are
accepted, run `admit_furniture_candidate.mjs <id> --scope <builtin|user-generated> --materials-accepted --material-evidence <path>
--appearance-accepted --appearance-evidence <path>`.
Admission writes evidence, changes status to candidate, synchronizes registries, and verifies the
project. Failure writes an explicit draft with stale evidence cleared and re-synchronizes registries.

Both evidence paths are JSON envelopes with `schemaVersion: 1`, the current `assetId`, current
`contractHash`, `result: "accepted"`, and all validation configuration IDs. Material evidence uses
`kind: "material-review"`. Appearance evidence uses `kind: "source-reload-comparison"` and also
records `cameraHash`, `lightingPreset`, `sourceImage`, and `reloadedImage`, so an unrelated or stale
comparison cannot admit the asset.

Every state needs matrix coverage. Every parameter needs the default and at least one non-default
legal value; enum and boolean parameters cover all discrete values. Add explicit configurations for
important state/parameter interactions without creating an unbounded Cartesian product.
