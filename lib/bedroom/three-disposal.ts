import * as THREE from "three";

export function disposeObjectTree(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
    if (object.geometry instanceof THREE.BufferGeometry) geometries.add(object.geometry);
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    entries.forEach((material) => {
      if (!material) return;
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
      const uniforms = (material as THREE.ShaderMaterial).uniforms;
      if (uniforms) {
        Object.values(uniforms).forEach((uniform) => {
          if (uniform?.value instanceof THREE.Texture) textures.add(uniform.value);
        });
      }
    });
  });

  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}
