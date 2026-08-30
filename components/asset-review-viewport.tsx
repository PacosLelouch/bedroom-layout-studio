"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createAdaptedGeneratedModel } from "@/lib/bedroom/generated/model-adapter";
import type { GeneratedAssetDescriptor, ModelFitReport, ReviewViewId } from "@/lib/bedroom/generated/types";
import type { Dimensions3D } from "@/lib/bedroom/types";
import { disposeObjectTree } from "@/lib/bedroom/three-disposal";

interface Props {
  asset: GeneratedAssetDescriptor;
  dimensions: Dimensions3D | null;
  view: ReviewViewId;
  onInspect: (report: ModelFitReport, hierarchy: string[]) => void;
}

declare global {
  interface Window {
    __IMG2THREEJS_REVIEW__?: {
      ready: boolean;
      assetId: string;
      view: ReviewViewId;
      report: ModelFitReport;
    };
  }
}

export function AssetReviewViewport({ asset, dimensions, view, onInspect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onInspect);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { callbackRef.current = onInspect; }, [onInspect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setError(null);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      const errorTimer = window.setTimeout(() => setError("当前浏览器无法建立 WebGL 检视画布。"), 0);
      return () => window.clearTimeout(errorTimer);
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#dedbd3");
    const camera = new THREE.PerspectiveCamera(36, 1, 1, 30000);
    const world = new THREE.Group();
    scene.add(world);
    scene.add(new THREE.HemisphereLight("#fffdf5", "#6c675e", 2.2));
    const key = new THREE.DirectionalLight("#fff1dc", 3.2);
    key.position.set(-1800, 2600, 2200);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#d8e9ff", 1.3);
    rim.position.set(1800, 1200, -1800);
    scene.add(rim);

    let adapted: ReturnType<typeof createAdaptedGeneratedModel>;
    try {
      adapted = createAdaptedGeneratedModel(asset.factory, dimensions);
    } catch (reason) {
      renderer.dispose();
      renderer.domElement.remove();
      const message = reason instanceof Error ? reason.message : "模型工厂执行失败。";
      const errorTimer = window.setTimeout(() => setError(message), 0);
      return () => window.clearTimeout(errorTimer);
    }

    world.add(adapted.group);
    const bounds = new THREE.Box3().setFromObject(adapted.group);
    const size = bounds.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    const floorSize = Math.max(1800, longest * 2.4);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorSize, floorSize),
      new THREE.MeshStandardMaterial({ color: "#eeeae2", roughness: 0.92 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    world.add(floor);
    const grid = new THREE.GridHelper(floorSize, 20, "#9e988e", "#c8c3ba");
    grid.position.y = 2;
    world.add(grid);
    const helper = new THREE.BoxHelper(adapted.group, "#d98d34");
    helper.userData.decorative = true;
    world.add(helper);

    const hierarchy: string[] = [];
    adapted.group.traverse((object) => {
      if (object !== adapted.group && object.name) hierarchy.push(object.name);
    });
    callbackRef.current(adapted.report, Array.from(new Set(hierarchy)).slice(0, 24));
    window.__IMG2THREEJS_REVIEW__ = { ready: true, assetId: asset.manifest.id, view, report: adapted.report };

    const target = new THREE.Vector3(0, size.y * 0.46, 0);
    const distance = Math.max(2200, longest * 2.35);
    const setView = () => {
      const positions: Record<ReviewViewId, [number, number, number]> = {
        reference: [-0.9, 0.72, 1.35],
        perspective: [1.15, 0.82, 1.25],
        front: [0, 0.5, 1.6],
        right: [1.6, 0.5, 0],
        rear: [0, 0.5, -1.6],
        left: [-1.6, 0.5, 0],
        top: [0, 1.7, 0.001],
      };
      const [x, y, z] = positions[view];
      camera.position.set(x * distance, y * distance, z * distance);
      camera.up.set(0, 1, 0);
      if (view === "top") camera.up.set(0, 0, -1);
      camera.lookAt(target);
    };
    setView();

    let orbiting = false;
    let lastX = 0;
    let lastY = 0;
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
    const onPointerDown = (event: PointerEvent) => {
      orbiting = true;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!orbiting) return;
      spherical.theta -= (event.clientX - lastX) * 0.008;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + (event.clientY - lastY) * 0.006, 0.12, Math.PI / 2 - 0.03);
      lastX = event.clientX;
      lastY = event.clientY;
      camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
      camera.lookAt(target);
    };
    const onPointerUp = (event: PointerEvent) => {
      orbiting = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      spherical.radius = THREE.MathUtils.clamp(spherical.radius + event.deltaY * 2, longest * 1.25, longest * 5);
      camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
      camera.lookAt(target);
    };
    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    resize();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      disposeObjectTree(world);
      renderer.dispose();
      renderer.domElement.remove();
      delete window.__IMG2THREEJS_REVIEW__;
    };
  }, [asset, dimensions, view]);

  if (error) return <div className="review-viewport-error"><strong>无法显示模型</strong><span>{error}</span></div>;
  return <div ref={hostRef} className="asset-review-viewport" aria-label={`${asset.manifest.name}三维检视画布`} />;
}
