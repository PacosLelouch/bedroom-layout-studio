# Read-only img2threejs routing

`.agents/skills/img2threejs` is a Git submodule and remains unmodified. Use its existing `generic`
profile and pass an asset-local state path, for example:

```powershell
python .agents/skills/img2threejs/forge/state.py init `
  --state apps/web/lib/bedroom/assets/<builtin|user-generated>/<asset-id>/reconstruction/state.json `
  --reference <reference> --profile generic `
  --spec apps/web/lib/bedroom/assets/<builtin|user-generated>/<asset-id>/reconstruction/object-sculpt-spec.json
```

Put sourced dimensions, required states, parameters, semantic components, GLB-safe appearance, and
design overrides into the reconstruction brief/spec. Follow the submodule's gates completely. The
packaging layer consumes the factory, components, pivots, materials, and evidence; extra generic
socket, collider, explosion, or destruction metadata is not exposed as furniture capability.
