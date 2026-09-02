# Bedroom furniture source contract

Every furniture authoring package has the same physical and logical shape. The only directory-level
split is delivery ownership:

```text
apps/web/lib/bedroom/assets/<builtin|user-generated>/<asset-id>/
├─ asset.json       # required manifest v3
├─ runtime.ts       # required; exports createFurnitureModel
├─ model.ts         # optional; exports createSourceModel
├─ resources/       # optional textures and runtime resources
├─ reconstruction/ # optional source/spec/workflow state
└─ evidence/       # optional contract-hashed reports
```

Set `assetScope` to `builtin` when the repository ships the asset, even when this skill or
img2threejs created it. Set it to `user-generated` for user-owned assets. Scope never describes how
the geometry was made. Record that separately in `origin.method` as `manual-procedural`,
`existing-procedural`, `img2threejs`, or `hybrid`. Use `lifecyclePolicy` independently: repository
content is normally `repository-trusted`; user assets are normally `user-reviewed`.

Do not create `descriptor.ts`, arbitrary factory filenames, or manifest fields that select exports.
The runtime entry and export names are fixed so discovery, review, validation, and application
loading cannot disagree. `model.ts` is absent for a direct runtime implementation; it is present
only when retaining a distinct source/reconstruction model adds value.

The runtime factory accepts `FurnitureConfiguration` plus purpose `scene | review | export`. The
same configuration is deterministic, Y-up, grounded, and centered. Export omits lights, helpers,
review decoration, runtime shaders, and behavior that exists only as a function in `userData`.

This directory is an authoring package, not the cloud browser transport. TypeScript is compiled by
the repository build or a controlled cloud publication build. Cloud delivery emits a standard
ECMAScript module with the same factory semantics; it does not emit a custom scene language and
does not use GLB as the browser runtime. Read [cloud runtime packaging](cloud-runtime-packaging.md)
before producing a remote revision.

Manifest v3 declares identity, scope, modeling provenance, lifecycle, appearance, dimensions,
parameters, finite states, semantic components, capability bindings, validation configurations,
design overrides, placement policies, reconstruction provenance, and evidence. A movable component
has a named pivot. A state or parameter must cause its declared observable effect; a no-op is an
error. Images establish form and proportion, never millimeter dimensions.

`appearance.defaultColor` is catalog appearance, not an implicit user parameter. Put a color in
`parameterDefinitions` only when users may change it. `footprintPolicy` describes occupied plan
bounds; `clearancePolicy` describes operational space. A bounded validation matrix contains the
exact default and controlled pairs for every capability.

For repository-only v3 packages, the current contract hash covers `model.ts` when present,
`runtime.ts`, and capability fields. For cloud publication the approved contract must additionally
bind the runtime ABI version and the complete published artifact-set hash. Evidence must reference
the current contract hash; a mismatch makes effective status draft. GLB may remain export and
portability evidence, but ESM publication requires evidence from the actual compiled runtime module.

Database rows never contain this manifest or any other asset body. They may contain its object key,
SHA-256, schema version, lifecycle status, and revision relationships. Object storage is the byte
source of truth.
