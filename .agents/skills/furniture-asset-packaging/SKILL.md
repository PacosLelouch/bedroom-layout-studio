---
name: furniture-asset-packaging
description: Create, package, revise, validate, and admit procedural Three.js furniture as technically ready bedroom-layout candidates, including repository packages and cloud-delivered ESM revisions. Use for reference-to-candidate orchestration, existing factory integration, and prompt-driven changes to dimensions, states, parameters, components, appearance, or finite-state behavior.
---

# Furniture asset packaging

Own the bedroom-layout furniture lifecycle from TypeScript source package to technically ready
candidate. A `candidate` has complete dimensions, configuration, capabilities, component semantics,
and evidence bound to the current contract hash; user visual approval is the only remaining step.
GLB is optional export/portability evidence, not the browser runtime transport. Anything less stays
`draft`.

## Route

- **Create**: preflight dimensions, states, parameters, components, export requirements, and user
  design overrides. When reconstruction is genuinely needed, use the checked-out `img2threejs`
  submodule read-only with its existing `generic` profile and an asset-local `--state`.
- **Package**: preserve an existing procedural factory where practical; add the project runtime
  wrapper, manifest capabilities, validation configurations, and evidence. For a cloud revision,
  also produce a platform-built standard ESM publication package; never invent a furniture DSL.
- **Revise**: classify the requested change. Edit manifest/wrapper or the repository-owned factory
  at the narrowest correct layer, invalidate stale evidence, and re-admit the asset.

Never modify the `img2threejs` submodule or its gitlink. Do not run the full reconstruction pipeline
for metadata, capability mapping, or a bounded edit to an existing factory.

## Required outcome

- Choose `assetScope` from delivery intent, not modeling method: use `builtin` for assets shipped by
  the repository (including assets created by this skill), and `user-generated` for user-owned
  assets. Both scopes use the identical package contract.
- Every package has fixed `asset.json` and `runtime.ts` names. `runtime.ts` exports
  `createFurnitureModel`. Use optional `model.ts` with `createSourceModel` only when a distinct
  reconstruction/source model is useful. Never add descriptor files or configurable factory names.
- Treat `.ts` files as authoring sources. Repository delivery uses the site build; cloud delivery
  uses a controlled build that emits immutable `runtime/runtime.mjs` plus a package index and
  resources in object storage. Browser runtime modules remain standard ECMAScript modules.
- Never put manifest, source, runtime, geometry, texture, or evidence bodies in database fields.
  Database records contain control-plane metadata, object keys, hashes, and relationships only.
- Use manifest schema v3 and keep incomplete work `draft`.
- Keep Y-up, ground at Y=0, center on X/Z, and preserve semantic component and pivot names.
- Expose only requested or approved user parameters. Empty parameter/state lists are valid.
- Supply a bounded validation matrix containing the exact default configuration, every state,
  every boolean/enum value, and default plus a non-default value for number/color parameters.
- Compare every capability against a configuration that changes only that state or parameter.
- Build every matrix entry for `scene`, `review`, and `export`; reject no-op states or parameters.
- Validate every configuration against the actual delivery runtime. Keep portable PBR,
  vertex-color, baked-texture, and GLB checks when export interoperability is requested or while the
  repository's v3 admission tooling still requires them; do not substitute GLB for ESM runtime
  validation.
- Run `scripts/admit_furniture_candidate.mjs` with the package scope after structural and compiled
  ESM checks. Require material and appearance evidence only with `--validate-glb`.
- Use `/furniture-review?asset=<asset-id>` for user approval after candidate admission. The old
  `/asset-review` route is compatibility-only.

Before authoring or changing an asset, read [the furniture asset contract](references/furniture-asset-contract.md).
For a cloud revision or backend publication read [cloud runtime packaging](references/cloud-runtime-packaging.md).
For admission read [candidate readiness](references/candidate-readiness.md). For existing-asset
changes read [revision routing](references/asset-revision-routing.md). Read
[read-only img2threejs routing](references/img2threejs-readonly-routing.md) only when reconstruction
may be required.

Repository writes remain scoped to the user's requested project action. Do not commit, push, or
deploy merely because admission completed.
