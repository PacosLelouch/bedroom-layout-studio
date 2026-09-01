import type * as THREE from "three";
export class SceneResourceCache<T extends THREE.Material | THREE.BufferGeometry> { private resources = new Map<string, T>(); get(key: string) { return this.resources.get(key); } set(key: string, value: T) { this.resources.set(key, value); return value; } dispose() { this.resources.forEach((resource) => resource.dispose()); this.resources.clear(); } }
