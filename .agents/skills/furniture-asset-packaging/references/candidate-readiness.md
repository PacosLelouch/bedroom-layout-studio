# Candidate readiness

Validate the artifact that users will actually run. A repository asset is exercised through its
site-bundled module. A cloud asset must be exercised through the compiled `runtime/runtime.mjs` and
package-index resource resolver, with evidence bound to the published artifact-set hash. Loading
the TypeScript source through Vite is not sufficient evidence for a cloud publication.

Compiled ESM validation is mandatory for both repository and cloud admission. If the ESM validator
is unavailable, keep the revision `draft` rather than claiming candidate readiness. GLB
export/reload is an optional portability gate, enabled only when the revision claims GLB export.

Run structural validation with `node .agents/skills/furniture-asset-packaging/scripts/validate_furniture_asset.mjs <id> --scope <builtin|user-generated> --candidate --out <report>`.
Run browser-artifact validation with `node .agents/skills/furniture-asset-packaging/scripts/smoke_runtime_esm.mjs <id> --scope <builtin|user-generated> --out <report>`.
Build an immutable publication package with `node .agents/skills/furniture-asset-packaging/scripts/build_furniture_package.mjs <id> --scope <builtin|user-generated> --tenant-id <uuid> --asset-id <uuid> --revision-id <uuid> --out <dir>`.

For normal ESM-only admission run `admit_furniture_candidate.mjs <id> --scope <builtin|user-generated>`.
When GLB is a declared deliverable, inspect the portable material path and source/export-reload
appearance, then add `--validate-glb --materials-accepted --material-evidence <path>
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
