# Cloud runtime packaging

Use this route only for a backend revision or another asset that must load without rebuilding the
website. Repository packages still use the same TypeScript source contract and runtime ABI.

## Publication shape

The controlled Runner emits immutable objects below a backend-generated revision prefix:

```text
tenants/{tenantId}/assets/{assetId}/revisions/{revisionId}/
├─ package-index.json
├─ contract/asset.json
├─ source/runtime.ts
├─ source/model.ts                 # optional
├─ source/resources/...            # optional
├─ runtime/runtime.mjs
├─ runtime/resources/...           # optional
├─ reconstruction/...              # optional
└─ evidence/...
```

`runtime.mjs` is a standard ECMAScript module compiled from the package sources. Bundle private
source dependencies. It may use only the pinned furniture runtime ABI for Three.js and resource
resolution; reject undeclared dynamic imports and arbitrary network dependencies. Keep logical
resource paths in source and resolve them through the host context so signed object URLs are never
part of the contract.

The package index lives in object storage and lists logical path, object key, SHA-256, byte size,
and MIME for every published object. Write it last, after every referenced object exists and has
been verified. Compute a deterministic artifact-set hash from the index and bind the contract hash,
validation, and approval to that artifact set and runtime ABI version.

## Database boundary

Database records contain only control-plane metadata and locators: asset/revision IDs, ownership,
status, runtime ABI version, contract/artifact hashes, package root key, package index key and hash,
artifact keys, and review/publication relationships. Never write manifest JSON, TypeScript,
JavaScript, geometry, material, texture, image, or evidence bodies into database columns.

Filesystem and S3 are interchangeable object-storage implementations. Do not assume an object key
is an API-server local path, expose bucket enumeration, or let clients choose a final revision key.

## Runtime evidence

Load the compiled module through the same URL, MIME, CORS, CSP, package-index resolver, and runtime
ABI used by the product. Exercise the exact default configuration, every state, every discrete
parameter value, bounded numeric/color alternatives, and important combinations for `scene`,
`review`, and `export`. Verify dimensions, grounding, component and pivot names, declared behavior,
resource integrity, node/vertex/texture budgets, cleanup, and deterministic output.

GLB is an optional export and portability check. It does not replace ESM evidence and is not the
cloud browser runtime.

## Execution gate

Ownership and visual review do not authorize code execution. Repository modules are
`repository-bundled`; cloud modules become `platform-built-esm` only after isolated compilation,
closed-dependency inspection, runtime validation, artifact hashing, and approval of the current
contract. Arbitrary uploaded JS/TS remains `quarantined-source`. If the platform ESM validator or
execution isolation is unavailable, store the package as `draft` and stop before candidate or
publication.
