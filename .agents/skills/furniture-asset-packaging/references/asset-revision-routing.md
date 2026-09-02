# Asset revision routing

Record explicit user changes as `designOverrides`; user instructions outrank the original image for
the named component/property. Unchanged regions remain reference-locked.

- Edit manifest for labels, sourced dimensions, constraints, defaults, and capability declarations.
- Edit `runtime.ts` to map existing nodes/actions into states and parameters.
- Edit optional `model.ts`, or the direct model code in `runtime.ts`, for bounded geometry or
  portable PBR/vertex-color/material work.
- Use read-only img2threejs only for substantial reconstruction, missing continuous geometry, or a
  missing component hierarchy/pivot that cannot be repaired reliably.
- Continuous animation, physics, or electrical behavior is outside the finite-state contract; name
  the required application-contract expansion instead of hiding functions in `userData`.
- Keep behavior in standard TypeScript/ECMAScript. Do not replace a requested scripted model with a
  project-specific scene language. For cloud delivery, rebuild the closed ESM publication package,
  resources, package index, and artifact-set hash after any source or dependency change.

Any capability or factory edit changes the contract hash. Treat the asset as draft until the full
matrix and actual delivery-runtime evidence have been regenerated. Regenerate GLB evidence as well
when the current v3 compatibility gate or an explicit export requirement applies.
