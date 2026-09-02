"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createAdaptedGeneratedModel } from "@/lib/bedroom/assets/model-adapter";
import type { ModelFitReport, FurnitureSourceModelFactory } from "@/lib/bedroom/assets/package-types";
import type { ReviewViewId } from "@/lib/bedroom/assets/manifest-types";
import type { FurnitureReviewAsset } from "@/lib/bedroom/furniture-review-registry";
import type { FurnitureRuntimeFactory } from "@/lib/bedroom/assets/runtime-types";
import type { Dimensions3D, FurnitureConfiguration } from "@/lib/bedroom/types";
import { disposeObjectTree } from "@/lib/bedroom/three-disposal";
import { loadFurnitureReviewFactory } from "@/lib/bedroom/review/runtime-loader";
import { loadFurnitureNativeFactory } from "@/lib/bedroom/review/native-model-loader";

interface Props {
  asset: FurnitureReviewAsset;
  dimensions: Dimensions3D | null;
  configuration?: FurnitureConfiguration | null;
  view: ReviewViewId;
  onInspect: (report: ModelFitReport, hierarchy: string[]) => void;
}

interface ReviewCameraState {
  assetId: string;
  view: ReviewViewId;
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}

const REVIEW_GRID_UNIT_MM = 100;
const REVIEW_GRID_MAJOR_UNIT_MM = 1000;
const REVIEW_GRID_MIN_SIZE_MM = 4000;
const REVIEW_GRID_MARGIN_FACTOR = 2.4;

declare global {
  interface Window {
    __FURNITURE_REVIEW__?: {
      ready: boolean;
      assetId: string;
      view: ReviewViewId;
      report: ModelFitReport;
      cameraPosition: [number, number, number];
      cameraTarget: [number, number, number];
      cameraUp: [number, number, number];
      gridSize: number;
      gridUnit: number;
      gridMajorUnit: number;
    };
  }
}

export function AssetReviewViewport({ asset, dimensions, configuration, view, onInspect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onInspect);
  const cameraStateRef = useRef<ReviewCameraState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [factories, setFactories] = useState<{ runtime: FurnitureRuntimeFactory; native?: FurnitureSourceModelFactory } | null>(null);
  const runtimeFactory = factories?.runtime ?? null;
  const nativeFactory = factories?.native;

  useEffect(() => { callbackRef.current = onInspect; }, [onInspect]);

  useEffect(() => {
    let active = true;
    setFactories(null);
    loadFurnitureReviewFactory(asset.manifest.id).then((runtime) => {
      if (!active) return;
      setFactories({ runtime });
      void loadFurnitureNativeFactory(asset.manifest.id).then((native) => { if (active) setFactories({ runtime, native }); });
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "家具运行模块加载失败。"); });
    return () => { active = false; };
  }, [asset.manifest.id]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !runtimeFactory) return;
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

    let displayGroup: THREE.Group;
    let inspectionReport: ModelFitReport;
    try {
      if (nativeFactory) {
        const adapted = createAdaptedGeneratedModel(nativeFactory, dimensions);
        displayGroup = configuration ? runtimeFactory(configuration, { purpose: "review" }) : adapted.group;
        if (displayGroup !== adapted.group) disposeObjectTree(adapted.group);
        inspectionReport = adapted.report;
      } else {
        const nextConfiguration = configuration ?? asset.manifest.defaultConfiguration;
        if (!nextConfiguration) throw new Error("家具缺少可检视的默认配置。");
        displayGroup = runtimeFactory(nextConfiguration, { purpose: "review" });
        displayGroup.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(displayGroup);
        const measured = box.getSize(new THREE.Vector3());
        inspectionReport = {
          nativeDimensions: { width: measured.x, depth: measured.z, height: measured.y },
          renderedDimensions: { width: measured.x, depth: measured.z, height: measured.y },
          axisScale: { width: 1, depth: 1, height: 1 },
          aspectDeviation: 0,
          aspectCompatible: true,
          grounded: Math.abs(box.min.y) <= 0.01,
        };
      }
    } catch (reason) {
      renderer.dispose();
      renderer.domElement.remove();
      const message = reason instanceof Error ? reason.message : "模型工厂执行失败。";
      const errorTimer = window.setTimeout(() => setError(message), 0);
      return () => window.clearTimeout(errorTimer);
    }

    world.add(displayGroup);
    const bounds = new THREE.Box3().setFromObject(displayGroup);
    const size = bounds.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    const stableDimensionConfigurations = [
      dimensions,
      asset.manifest.defaultConfiguration?.dimensions,
      ...asset.manifest.validationConfigurations.map((entry) => entry.dimensions),
    ].filter((entry): entry is Dimensions3D => Boolean(entry));
    const stableHorizontalSpan = Math.max(
      0,
      ...stableDimensionConfigurations.flatMap((entry) => [entry.width, entry.depth]).filter(Number.isFinite),
    );
    const gridSize = Math.ceil(
      Math.max(REVIEW_GRID_MIN_SIZE_MM, stableHorizontalSpan * REVIEW_GRID_MARGIN_FACTOR)
      / REVIEW_GRID_MAJOR_UNIT_MM,
    ) * REVIEW_GRID_MAJOR_UNIT_MM;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(gridSize, gridSize),
      new THREE.MeshStandardMaterial({ color: "#eeeae2", roughness: 0.92 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    world.add(floor);
    const fineGrid = new THREE.GridHelper(
      gridSize,
      gridSize / REVIEW_GRID_UNIT_MM,
      "#aaa398",
      "#d2cdc4",
    );
    fineGrid.position.y = 1;
    world.add(fineGrid);
    const majorGrid = new THREE.GridHelper(
      gridSize,
      gridSize / REVIEW_GRID_MAJOR_UNIT_MM,
      "#827a6e",
      "#aaa398",
    );
    majorGrid.position.y = 2;
    world.add(majorGrid);
    const helper = new THREE.BoxHelper(displayGroup, "#d98d34");
    helper.userData.decorative = true;
    world.add(helper);

    const hierarchy: string[] = [];
    displayGroup.traverse((object) => {
      if (object !== displayGroup && object.name) hierarchy.push(object.name);
    });
    callbackRef.current(inspectionReport, Array.from(new Set(hierarchy)).slice(0, 24));

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
      camera.lookAt(target);
    };
    const savedCamera = cameraStateRef.current;
    const restoreCamera = savedCamera?.assetId === asset.manifest.id && savedCamera.view === view
      ? savedCamera
      : null;
    if (restoreCamera) {
      camera.position.fromArray(restoreCamera.position);
      camera.up.fromArray(restoreCamera.up);
    } else {
      setView();
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    if (restoreCamera) controls.target.fromArray(restoreCamera.target);
    else controls.target.copy(target);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.9;
    const restoredDistance = camera.position.distanceTo(controls.target);
    controls.minDistance = restoreCamera ? Math.min(longest * 1.25, restoredDistance) : longest * 1.25;
    controls.maxDistance = restoreCamera ? Math.max(longest * 5, restoredDistance) : longest * 5;
    controls.minPolarAngle = 0.01;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    const publishReviewState = () => {
      const cameraPosition = camera.position.toArray() as [number, number, number];
      const cameraTarget = controls.target.toArray() as [number, number, number];
      const cameraUp = camera.up.toArray() as [number, number, number];
      cameraStateRef.current = {
        assetId: asset.manifest.id,
        view,
        position: cameraPosition,
        target: cameraTarget,
        up: cameraUp,
      };
      renderer.domElement.dataset.cameraPosition = cameraPosition.join(",");
      renderer.domElement.dataset.cameraTarget = cameraTarget.join(",");
      renderer.domElement.dataset.gridSize = String(gridSize);
      renderer.domElement.dataset.gridUnit = String(REVIEW_GRID_UNIT_MM);
      renderer.domElement.dataset.gridMajorUnit = String(REVIEW_GRID_MAJOR_UNIT_MM);
      window.__FURNITURE_REVIEW__ = {
        ready: true,
        assetId: asset.manifest.id,
        view,
        report: inspectionReport,
        cameraPosition,
        cameraTarget,
        cameraUp,
        gridSize,
        gridUnit: REVIEW_GRID_UNIT_MM,
        gridMajorUnit: REVIEW_GRID_MAJOR_UNIT_MM,
      };
    };
    const showDraggingCursor = () => { renderer.domElement.style.cursor = "grabbing"; };
    const showIdleCursor = () => { renderer.domElement.style.cursor = "grab"; };
    controls.addEventListener("change", publishReviewState);
    controls.addEventListener("start", showDraggingCursor);
    controls.addEventListener("end", showIdleCursor);
    showIdleCursor();
    controls.update();
    publishReviewState();
    let resizeFrame: number | null = null;
    let pendingWidth = 0;
    let pendingHeight = 0;
    let renderedWidth = -1;
    let renderedHeight = -1;
    const applyResize = () => {
      resizeFrame = null;
      const width = Math.max(1, Math.round(pendingWidth || host.clientWidth));
      const height = Math.max(1, Math.round(pendingHeight || host.clientHeight));
      if (width === renderedWidth && height === renderedHeight) return;
      renderedWidth = width;
      renderedHeight = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const scheduleResize = (width = host.clientWidth, height = host.clientHeight) => {
      pendingWidth = width;
      pendingHeight = height;
      if (resizeFrame === null) resizeFrame = requestAnimationFrame(applyResize);
    };
    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(-1);
      scheduleResize(entry?.contentRect.width, entry?.contentRect.height);
    });
    observer.observe(host);
    scheduleResize();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      publishReviewState();
      cancelAnimationFrame(frame);
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      controls.removeEventListener("change", publishReviewState);
      controls.removeEventListener("start", showDraggingCursor);
      controls.removeEventListener("end", showIdleCursor);
      controls.dispose();
      disposeObjectTree(world);
      renderer.dispose();
      renderer.domElement.remove();
      delete window.__FURNITURE_REVIEW__;
    };
  }, [asset, runtimeFactory, nativeFactory, configuration, dimensions, view]);

  if (error) return <div className="review-viewport-error"><strong>无法显示模型</strong><span>{error}</span></div>;
  if (!factories) return <div className="review-viewport-error"><strong>正在加载模型</strong><span>按当前资产加载运行模块…</span></div>;
  return <div ref={hostRef} className="asset-review-viewport" aria-label={`${asset.manifest.name}家具三维检视画布`} />;
}
