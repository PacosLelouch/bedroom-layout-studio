"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createAssetGroup } from "@/lib/bedroom/asset-registry";
import type { FurnitureItem, RoomLayout, ViewMode } from "@/lib/bedroom/types";

interface Props {
  room: RoomLayout;
  selectedId: string | null;
  collisionIds: Set<string>;
  viewMode: ViewMode;
  snap: number;
  showGrid: boolean;
  showWalls: boolean;
  onSelect: (id: string | null) => void;
  onChangeItem: (id: string, patch: Partial<FurnitureItem>) => void;
}

type ViewportState = { rebuild: () => void };

export function BedroomViewport(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);

  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e9e6df");
    scene.fog = new THREE.Fog("#e9e6df", 7800, 12000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const perspective = new THREE.PerspectiveCamera(38, 1, 10, 30000);
    const orthographic = new THREE.OrthographicCamera(-3000, 3000, 2200, -2200, 10, 30000);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    const target = new THREE.Vector3();
    const world = new THREE.Group();
    scene.add(world);
    scene.add(new THREE.HemisphereLight("#fffdf4", "#9c9284", 2.1));
    const sun = new THREE.DirectionalLight("#fff4dc", 3.1);
    sun.position.set(-2400, 5200, 2600);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -5000;
    sun.shadow.camera.right = sun.shadow.camera.top = 5000;
    scene.add(sun);

    let camera: THREE.Camera = perspective;
    let draggingId: string | null = null;
    let orbiting = false;
    let lastX = 0;
    let lastY = 0;
    let azimuth = -0.72;
    let elevation = 0.9;
    let distance = 7200;

    const clearWorld = () => {
      world.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((entry) => entry.dispose());
        }
      });
      world.clear();
    };

    const updateCamera = () => {
      const current = propsRef.current;
      const { width, depth } = current.room.dimensions;
      target.set(width / 2, 0, depth / 2);
      if (current.viewMode === "top") {
        camera = orthographic;
        const span = Math.max(width, depth) * 0.72;
        const aspect = Math.max(0.5, host.clientWidth / Math.max(1, host.clientHeight));
        orthographic.left = -span * aspect;
        orthographic.right = span * aspect;
        orthographic.top = span;
        orthographic.bottom = -span;
        orthographic.position.set(width / 2, 10000, depth / 2);
        orthographic.up.set(0, 0, -1);
        orthographic.lookAt(target);
        orthographic.updateProjectionMatrix();
      } else {
        camera = perspective;
        const horizontal = distance * Math.cos(elevation);
        perspective.position.set(target.x + horizontal * Math.sin(azimuth), distance * Math.sin(elevation), target.z + horizontal * Math.cos(azimuth));
        perspective.lookAt(target.x, 400, target.z);
        perspective.updateProjectionMatrix();
      }
    };

    const rebuild = () => {
      clearWorld();
      const current = propsRef.current;
      const { width, depth, height } = current.room.dimensions;
      const floorMaterial = new THREE.MeshStandardMaterial({ color: "#f8f5ed", roughness: 0.86 });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 70, depth), floorMaterial);
      floor.position.set(width / 2, -35, depth / 2);
      floor.receiveShadow = true;
      world.add(floor);
      if (current.showGrid) {
        const grid = new THREE.GridHelper(Math.max(width, depth) * 1.5, Math.ceil(Math.max(width, depth) / 200), "#aaa49a", "#d3cec5");
        grid.position.set(width / 2, 4, depth / 2);
        grid.material.opacity = 0.52;
        grid.material.transparent = true;
        world.add(grid);
      }
      if (current.showWalls) {
        const wallMaterial = new THREE.MeshStandardMaterial({ color: "#f1eee6", roughness: 0.88, transparent: true, opacity: 0.74 });
        const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, 110), wallMaterial);
        back.position.set(width / 2, height / 2, 0);
        back.receiveShadow = true;
        world.add(back);
        const left = new THREE.Mesh(new THREE.BoxGeometry(110, height, depth), wallMaterial.clone());
        left.position.set(0, height / 2, depth / 2);
        left.receiveShadow = true;
        world.add(left);
      }
      for (const item of current.room.items) {
        const group = createAssetGroup(item);
        group.position.set(item.position.x, 0, item.position.z);
        group.rotation.y = THREE.MathUtils.degToRad(item.rotation);
        if (current.selectedId === item.id || current.collisionIds.has(item.id)) {
          const helper = new THREE.BoxHelper(group, current.collisionIds.has(item.id) ? "#dc6549" : "#d89439");
          helper.userData.decorative = true;
          group.add(helper);
        }
        world.add(group);
      }
      updateCamera();
    };

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      renderer.setSize(width, height, false);
      perspective.aspect = width / Math.max(1, height);
      updateCamera();
    };
    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const pick = (event: PointerEvent) => {
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(world.children, true);
      for (const hit of hits) {
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.furnitureId) object = object.parent;
        if (object?.userData.furnitureId) return object.userData.furnitureId as string;
      }
      return null;
    };
    const onPointerDown = (event: PointerEvent) => {
      renderer.domElement.setPointerCapture(event.pointerId);
      const id = pick(event);
      if (id) {
        draggingId = id;
        propsRef.current.onSelect(id);
        renderer.domElement.style.cursor = "grabbing";
      } else if (propsRef.current.viewMode === "perspective") {
        propsRef.current.onSelect(null);
        orbiting = true;
        lastX = event.clientX;
        lastY = event.clientY;
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (draggingId) {
        setPointer(event);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
          const current = propsRef.current;
          const item = current.room.items.find((entry) => entry.id === draggingId);
          if (!item) return;
          const rotated = Math.abs(item.rotation % 180) === 90;
          const width = rotated ? item.size.depth : item.size.width;
          const depth = rotated ? item.size.width : item.size.depth;
          const x = Math.max(width / 2, Math.min(current.room.dimensions.width - width / 2, Math.round(hitPoint.x / current.snap) * current.snap));
          const z = Math.max(depth / 2, Math.min(current.room.dimensions.depth - depth / 2, Math.round(hitPoint.z / current.snap) * current.snap));
          current.onChangeItem(draggingId, { position: { x, z } });
        }
      } else if (orbiting) {
        azimuth -= (event.clientX - lastX) * 0.008;
        elevation = Math.max(0.28, Math.min(1.35, elevation + (event.clientY - lastY) * 0.006));
        lastX = event.clientX;
        lastY = event.clientY;
        updateCamera();
      } else {
        renderer.domElement.style.cursor = pick(event) ? "grab" : propsRef.current.viewMode === "perspective" ? "move" : "default";
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      draggingId = null;
      orbiting = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "default";
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (propsRef.current.viewMode === "perspective") {
        distance = Math.max(3800, Math.min(12000, distance + event.deltaY * 4));
      } else {
        orthographic.zoom = Math.max(0.55, Math.min(2.4, orthographic.zoom * (event.deltaY > 0 ? 0.92 : 1.08)));
        orthographic.updateProjectionMatrix();
      }
      updateCamera();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    let frame = 0;
    const animate = () => { frame = requestAnimationFrame(animate); renderer.render(scene, camera); };
    rebuild();
    resize();
    animate();
    (host as HTMLDivElement & { __bedroomState?: ViewportState }).__bedroomState = { rebuild };

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      clearWorld();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current as (HTMLDivElement & { __bedroomState?: ViewportState }) | null;
    host?.__bedroomState?.rebuild();
  }, [props.room, props.selectedId, props.collisionIds, props.viewMode, props.showGrid, props.showWalls]);

  return <div ref={hostRef} className="three-viewport" aria-label={`${props.room.name}三维布局编辑画布`} />;
}
