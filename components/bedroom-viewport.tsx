"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createFurnitureModel, loadFurnitureRuntime } from "@/lib/bedroom/assets/runtime-cache";
import { clearanceRect, collides, footprint, isSimplePolygon } from "@/lib/bedroom/geometry";
import { disposeObjectTree } from "@/lib/bedroom/three-disposal";
import { RoomSceneController } from "@/lib/bedroom/scene/room-scene-controller";
import { BEDROOM_PERFORMANCE_MARKS, markBedroomPerformance } from "@/lib/bedroom/performance";
import type { FurnitureItem, InteractionMode, RoomLayout, ViewMode } from "@/lib/bedroom/types";

interface Props {
  room: RoomLayout;
  rooms?: RoomLayout[];
  selectedId: string | null;
  collisionIds: Set<string>;
  viewMode: ViewMode;
  interactionMode: InteractionMode;
  snap: number;
  showGrid: boolean;
  showWalls: boolean;
  collisionDetectionEnabled: boolean;
  onSelect: (id: string | null) => void;
  onChangeItem: (id: string, patch: Partial<FurnitureItem>, options?: { recordHistory?: boolean }) => void;
  onChangeOutline: (outline: RoomLayout["outline"], options?: {
    recordHistory?: boolean;
    wallMove?: { axis: "x" | "z"; from: number; to: number };
  }) => void;
  onToggleDoor: (id: string) => void;
  onInteractItem: (id: string) => void;
}

type ViewportState = RoomSceneController<Props>;

export function BedroomViewport(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [assetLoadState, setAssetLoadState] = useState({ loaded: 0, total: 0, failed: 0 });

  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e9e6df");
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      const fallbackTimer = window.setTimeout(() => setWebglUnavailable(true), 0);
      return () => window.clearTimeout(fallbackTimer);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const perspective = new THREE.PerspectiveCamera(42, 1, 10, 50000);
    const orthographic = new THREE.OrthographicCamera(-3000, 3000, 2200, -2200, 10, 30000);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    const target = new THREE.Vector3();
    let world = new THREE.Group();
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
    let dragAction: "move" | "rotate" | null = null;
    let dragHistoryRecorded = false;
    let dragStartX = 0;
    let dragStartRotation = 0;
    let draggingOutlineIndex: number | null = null;
    let outlineHistoryRecorded = false;
    let orbiting = false;
    let lastX = 0;
    let lastY = 0;
    let azimuth = 0.72;
    let elevation = 0.76;
    let distance = 9000;
    let buildRevision = 0;
    let disposed = false;
    let frameScheduled = false;
    let renderedProps = propsRef.current;
    let furnitureById = new Map<string, THREE.Group>();
    let activeRoomId = renderedProps.room.id;
    let activeRoomReference = renderedProps.room;
    const roomCache = new Map<string, { world: THREE.Group; furnitureById: Map<string, THREE.Group>; roomReference: RoomLayout; lastUsedAt: number }>();
    const cameraStates = new Map<string, { azimuth: number; elevation: number; distance: number; topZoom: number }>();
    const prewarmedAssets = new Set<string>();
    let idleHandle: number | null = null;
    const requestIdle = window.requestIdleCallback?.bind(window);
    const cancelIdle = window.cancelIdleCallback?.bind(window);
    let changeFrame: number | null = null;
    let pendingChange: { id: string; patch: Partial<FurnitureItem>; recordHistory: boolean } | null = null;
    const flushItemChange = () => {
      if (changeFrame !== null) cancelAnimationFrame(changeFrame);
      changeFrame = null; const change = pendingChange; pendingChange = null;
      if (change) propsRef.current.onChangeItem(change.id, change.patch, { recordHistory: change.recordHistory });
    };
    const queueItemChange = (id: string, patch: Partial<FurnitureItem>, recordHistory: boolean) => {
      pendingChange = { id, patch, recordHistory: pendingChange?.recordHistory || recordHistory };
      if (changeFrame === null) changeFrame = requestAnimationFrame(flushItemChange);
    };

    const invalidate = () => {
      if (frameScheduled) return;
      frameScheduled = true;
      requestAnimationFrame(() => {
        frameScheduled = false;
        renderer.render(scene, camera);
      });
    };

    const clearWorld = () => {
      disposeObjectTree(world);
      world.clear();
      furnitureById.clear();
    };

    const updateCamera = () => {
      const current = propsRef.current;
      const { width, depth } = current.room.dimensions;
      const sceneWidth = width + (current.room.bayWindow?.side === "right" ? current.room.bayWindow.depth : 0);
      const sceneDepth = depth + (current.room.bayWindow?.side === "bottom" ? current.room.bayWindow.depth : 0);
      target.set(sceneWidth / 2, 0, sceneDepth / 2);
      if (current.viewMode === "top") {
        camera = orthographic;
        const span = Math.max(sceneWidth, sceneDepth) * 0.72;
        const aspect = Math.max(0.5, host.clientWidth / Math.max(1, host.clientHeight));
        orthographic.left = -span * aspect;
        orthographic.right = span * aspect;
        orthographic.top = span;
        orthographic.bottom = -span;
        orthographic.position.set(sceneWidth / 2, 10000, sceneDepth / 2);
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
      buildRevision += 1;
      const current = propsRef.current;
      if (current.room.id !== activeRoomId) {
        cameraStates.set(activeRoomId, { azimuth, elevation, distance, topZoom: orthographic.zoom });
        roomCache.set(activeRoomId, { world, furnitureById, roomReference: activeRoomReference, lastUsedAt: performance.now() });
        scene.remove(world);
        const cached = roomCache.get(current.room.id);
        if (cached && cached.roomReference === current.room) {
          world = cached.world; furnitureById = cached.furnitureById; activeRoomId = current.room.id; activeRoomReference = current.room; cached.lastUsedAt = performance.now(); scene.add(world);
          const state = cameraStates.get(activeRoomId); if (state) { ({ azimuth, elevation, distance } = state); orthographic.zoom = state.topZoom; }
          setAssetLoadState({ loaded: current.room.items.length, total: current.room.items.length, failed: 0 }); updateCamera(); updateSelectionHelpers(); invalidate(); return;
        }
        world = new THREE.Group(); furnitureById = new Map(); activeRoomId = current.room.id; activeRoomReference = current.room; scene.add(world);
      } else {
        clearWorld();
      }
      const { width, depth, height } = current.room.dimensions;
      setAssetLoadState({ loaded: 0, total: current.room.items.length, failed: 0 });
      const targetWorld = world;
      const targetFurnitureMap = furnitureById;
      const floorMaterial = new THREE.MeshStandardMaterial({ color: "#f8f5ed", roughness: 0.86 });
      const floorShape = new THREE.Shape();
      current.room.outline.forEach((point, index) => index === 0 ? floorShape.moveTo(point.x, point.z) : floorShape.lineTo(point.x, point.z));
      floorShape.closePath();
      const floorGeometry = new THREE.ExtrudeGeometry(floorShape, { depth: 70, bevelEnabled: false });
      floorGeometry.rotateX(Math.PI / 2);
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.receiveShadow = true;
      world.add(floor);
      if (current.showGrid) {
        const sceneWidth = width + (current.room.bayWindow?.side === "right" ? current.room.bayWindow.depth : 0);
        const sceneDepth = depth + (current.room.bayWindow?.side === "bottom" ? current.room.bayWindow.depth : 0);
        const gridSize = Math.max(sceneWidth, sceneDepth) * 1.5;
        const grid = new THREE.GridHelper(gridSize, Math.ceil(gridSize / 200), "#aaa49a", "#d3cec5");
        grid.position.set(sceneWidth / 2, 4, sceneDepth / 2);
        grid.material.opacity = 0.52;
        grid.material.transparent = true;
        world.add(grid);
      }
      if (current.showWalls) {
        const wallMaterial = new THREE.MeshStandardMaterial({ color: "#eee8dc", roughness: 0.9, transparent: true, opacity: 0.72, depthWrite: true, side: THREE.DoubleSide });
        const wallEdgeMaterial = new THREE.LineBasicMaterial({ color: "#9f9688", transparent: true, opacity: 0.58 });
        const addWall = (a: { x: number; z: number }, b: { x: number; z: number }, wallHeight = height, centerY = wallHeight / 2) => {
          const length = Math.hypot(b.x - a.x, b.z - a.z);
          if (length < 1 || wallHeight < 1) return;
          const wall = new THREE.Mesh(new THREE.BoxGeometry(length, wallHeight, 80), wallMaterial.clone());
          wall.position.set((a.x + b.x) / 2, centerY, (a.z + b.z) / 2);
          wall.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
          wall.receiveShadow = true;
          world.add(wall);
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(wall.geometry), wallEdgeMaterial.clone());
          edges.position.copy(wall.position);
          edges.rotation.copy(wall.rotation);
          edges.userData.decorative = true;
          world.add(edges);
        };
        current.room.outline.forEach((point, index) => {
          const next = current.room.outline[(index + 1) % current.room.outline.length];
          const horizontal = point.z === next.z;
          const axis = horizontal ? "z" : "x";
          const coordinate = horizontal ? point.z : point.x;
          const start = Math.min(horizontal ? point.x : point.z, horizontal ? next.x : next.z);
          const end = Math.max(horizontal ? point.x : point.z, horizontal ? next.x : next.z);
          let spans: Array<[number, number]> = [[start, end]];
          (current.room.doors ?? []).filter((door) => door.wallAxis === axis && door.wallCoordinate === coordinate).forEach((door) => {
            const openingEnd = door.openingStart + door.width;
            const overlapStart = Math.max(start, door.openingStart);
            const overlapEnd = Math.min(end, openingEnd);
            if (overlapEnd > overlapStart) {
              const lintelHeight = Math.max(0, height - 2100);
              addWall(
                horizontal ? { x: overlapStart, z: coordinate } : { x: coordinate, z: overlapStart },
                horizontal ? { x: overlapEnd, z: coordinate } : { x: coordinate, z: overlapEnd },
                lintelHeight,
                2100 + lintelHeight / 2,
              );
            }
            spans = spans.flatMap(([from, to]) => {
              if (openingEnd <= from || door.openingStart >= to) return [[from, to]];
              const pieces: Array<[number, number]> = [];
              if (door.openingStart > from) pieces.push([from, door.openingStart]);
              if (openingEnd < to) pieces.push([openingEnd, to]);
              return pieces;
            });
          });
          const bay = current.room.bayWindow;
          const isBayOpening = bay && (
            (bay.side === "bottom" && axis === "z" && coordinate === depth) ||
            (bay.side === "right" && axis === "x" && coordinate === width)
          );
          if (isBayOpening) {
            const openingEnd = bay.start + bay.length;
            spans = spans.flatMap(([from, to]) => {
              if (openingEnd <= from || bay.start >= to) return [[from, to]];
              const pieces: Array<[number, number]> = [];
              if (bay.start > from) pieces.push([from, bay.start]);
              if (openingEnd < to) pieces.push([openingEnd, to]);
              return pieces;
            });
            const windowHeight = Math.max(600, height - bay.sillHeight - 300);
            const windowTop = bay.sillHeight + windowHeight;
            const openingStartPoint = horizontal ? { x: bay.start, z: coordinate } : { x: coordinate, z: bay.start };
            const openingEndPoint = horizontal ? { x: openingEnd, z: coordinate } : { x: coordinate, z: openingEnd };
            addWall(openingStartPoint, openingEndPoint, bay.sillHeight, bay.sillHeight / 2);
            addWall(openingStartPoint, openingEndPoint, height - windowTop, windowTop + (height - windowTop) / 2);
          }
          spans.forEach(([from, to]) => addWall(
            horizontal ? { x: from, z: coordinate } : { x: coordinate, z: from },
            horizontal ? { x: to, z: coordinate } : { x: coordinate, z: to },
          ));
        });
      }
      const bay = current.room.bayWindow;
      if (bay) {
        const bayGeometry = bay.side === "bottom"
          ? new THREE.BoxGeometry(bay.length, bay.sillHeight, bay.depth)
          : new THREE.BoxGeometry(bay.depth, bay.sillHeight, bay.length);
        const bayMesh = new THREE.Mesh(bayGeometry, new THREE.MeshStandardMaterial({ color: "#d8d0c3", roughness: 0.82 }));
        bayMesh.position.set(
          bay.side === "bottom" ? bay.start + bay.length / 2 : width + bay.depth / 2,
          bay.sillHeight / 2,
          bay.side === "bottom" ? depth + bay.depth / 2 : bay.start + bay.length / 2,
        );
        world.add(bayMesh);

        bayMesh.castShadow = true;
        bayMesh.receiveShadow = true;
        const bayEdges = new THREE.LineSegments(new THREE.EdgesGeometry(bayGeometry), new THREE.LineBasicMaterial({ color: "#8d8478" }));
        bayEdges.position.copy(bayMesh.position);
        world.add(bayEdges);

        const glassHeight = Math.max(600, height - bay.sillHeight - 300);
        const glassMaterial = new THREE.MeshPhysicalMaterial({
          color: "#d9f1f5",
          transparent: true,
          opacity: 0.12,
          transmission: 0.72,
          roughness: 0.08,
          metalness: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const frameMaterial = new THREE.MeshStandardMaterial({ color: "#8b989c", roughness: 0.42, transparent: true, opacity: 0.72 });
        const glassX = bay.side === "bottom" ? bay.start + bay.length / 2 : width + bay.depth;
        const glassZ = bay.side === "bottom" ? depth + bay.depth : bay.start + bay.length / 2;
        const addGlassPanel = (panelWidth: number, panelDepth: number, x: number, z: number) => {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(panelWidth, glassHeight, panelDepth), glassMaterial.clone());
          panel.position.set(x, bay.sillHeight + glassHeight / 2, z);
          world.add(panel);
        };
        if (bay.side === "bottom") {
          addGlassPanel(bay.length, 18, glassX, glassZ);
          addGlassPanel(18, bay.depth, bay.start, depth + bay.depth / 2);
          addGlassPanel(18, bay.depth, bay.start + bay.length, depth + bay.depth / 2);
        } else {
          addGlassPanel(18, bay.length, glassX, glassZ);
          addGlassPanel(bay.depth, 18, width + bay.depth / 2, bay.start);
          addGlassPanel(bay.depth, 18, width + bay.depth / 2, bay.start + bay.length);
        }

        const addFrame = (frameWidth: number, frameHeight: number, x: number, y: number, z: number) => {
          const frame = new THREE.Mesh(
            bay.side === "bottom" ? new THREE.BoxGeometry(frameWidth, frameHeight, 34) : new THREE.BoxGeometry(34, frameHeight, frameWidth),
            frameMaterial.clone(),
          );
          frame.position.set(x, y, z);
          world.add(frame);
        };
        addFrame(bay.length + 55, 48, glassX, bay.sillHeight + 24, glassZ);
        addFrame(bay.length + 55, 48, glassX, bay.sillHeight + glassHeight - 24, glassZ);
        for (const offset of [-bay.length / 2, 0, bay.length / 2]) {
          addFrame(48, glassHeight, bay.side === "bottom" ? glassX + offset : glassX, bay.sillHeight + glassHeight / 2, bay.side === "bottom" ? glassZ : glassZ + offset);
        }
        const returnFrameGeometry = bay.side === "bottom"
          ? new THREE.BoxGeometry(48, glassHeight, bay.depth)
          : new THREE.BoxGeometry(bay.depth, glassHeight, 48);
        for (const end of [bay.start, bay.start + bay.length]) {
          const returnFrame = new THREE.Mesh(returnFrameGeometry, frameMaterial.clone());
          returnFrame.position.set(
            bay.side === "bottom" ? end : width + bay.depth / 2,
            bay.sillHeight + glassHeight / 2,
            bay.side === "bottom" ? depth + bay.depth / 2 : end,
          );
          world.add(returnFrame);
        }
        const headerHeight = Math.max(80, height - bay.sillHeight - glassHeight);
        const headerGeometry = bay.side === "bottom"
          ? new THREE.BoxGeometry(bay.length, headerHeight, bay.depth)
          : new THREE.BoxGeometry(bay.depth, headerHeight, bay.length);
        const header = new THREE.Mesh(headerGeometry, new THREE.MeshStandardMaterial({ color: "#eee8dc", roughness: 0.9 }));
        header.position.set(
          bay.side === "bottom" ? bay.start + bay.length / 2 : width + bay.depth / 2,
          bay.sillHeight + glassHeight + headerHeight / 2,
          bay.side === "bottom" ? depth + bay.depth / 2 : bay.start + bay.length / 2,
        );
        header.castShadow = true;
        header.receiveShadow = true;
        world.add(header);
      }
      const zoneMaterial = new THREE.MeshBasicMaterial({ color: "#df8d55", transparent: true, opacity: 0.18, depthWrite: false });
      current.room.keepOutZones.forEach((zone) => {
        const marker = new THREE.Mesh(new THREE.PlaneGeometry(zone.width, zone.depth), zoneMaterial.clone());
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(zone.x + zone.width / 2, 5, zone.z + zone.depth / 2);
        world.add(marker);
      });
      const doorMaterial = new THREE.MeshStandardMaterial({ color: "#ad7c4e", roughness: 0.76, transparent: true, opacity: 0.82 });
      const frameMaterial = new THREE.MeshStandardMaterial({ color: "#6f6255", roughness: 0.82 });
      (current.room.doors ?? []).forEach((door) => {
        const angle = THREE.MathUtils.degToRad(door.isOpen === false ? door.closedAngle : door.openAngle);
        const endX = door.hinge.x + Math.cos(angle) * door.width;
        const endZ = door.hinge.z + Math.sin(angle) * door.width;
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(door.width, 2100, 42), doorMaterial.clone());
        leaf.position.set((door.hinge.x + endX) / 2, 1050, (door.hinge.z + endZ) / 2);
        leaf.rotation.y = -angle;
        leaf.userData.doorId = door.id;
        world.add(leaf);
        const doorHitArea = new THREE.Mesh(
          new THREE.BoxGeometry(door.width, 2100, 220),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
        );
        doorHitArea.position.copy(leaf.position);
        doorHitArea.rotation.copy(leaf.rotation);
        doorHitArea.userData.doorId = door.id;
        world.add(doorHitArea);
        const openingEnds = door.wallAxis === "x"
          ? [{ x: door.wallCoordinate, z: door.openingStart }, { x: door.wallCoordinate, z: door.openingStart + door.width }]
          : [{ x: door.openingStart, z: door.wallCoordinate }, { x: door.openingStart + door.width, z: door.wallCoordinate }];
        openingEnds.forEach((point) => {
          const jamb = new THREE.Mesh(new THREE.BoxGeometry(70, 2150, 70), frameMaterial.clone());
          jamb.position.set(point.x, 1075, point.z);
          world.add(jamb);
        });
        const arcPoints: THREE.Vector3[] = [];
        for (let step = 0; step <= 18; step += 1) {
          const arcAngle = THREE.MathUtils.degToRad(door.closedAngle + (door.openAngle - door.closedAngle) * step / 18);
          arcPoints.push(new THREE.Vector3(door.hinge.x + Math.cos(arcAngle) * door.width, 9, door.hinge.z + Math.sin(arcAngle) * door.width));
        }
        world.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(arcPoints),
          new THREE.LineBasicMaterial({ color: "#a56838", transparent: true, opacity: 0.9 }),
        ));
      });
      for (const item of current.room.items) {
        const placeholder = new THREE.Group();
        const placeholderMesh = new THREE.Mesh(new THREE.BoxGeometry(item.size.width, item.size.height, item.size.depth), new THREE.MeshBasicMaterial({ color: "#c8b69a", transparent: true, opacity: .22, wireframe: true }));
        placeholderMesh.position.y = item.size.height / 2; placeholder.add(placeholderMesh); placeholder.userData.furnitureId = item.id;
        placeholder.position.set(item.position.x, item.baseHeight ?? (item.wallMounted ? 1450 : 0), item.position.z); placeholder.rotation.y = THREE.MathUtils.degToRad(item.rotation);
        furnitureById.set(item.id, placeholder); world.add(placeholder);
        void createFurnitureModel(item).then((group) => {
          if (disposed || targetFurnitureMap.get(item.id) !== placeholder) { disposeObjectTree(group); return; }
          group.position.copy(placeholder.position); group.rotation.copy(placeholder.rotation); targetWorld.remove(placeholder); disposeObjectTree(placeholder); targetWorld.add(group); targetFurnitureMap.set(item.id, group); if (targetWorld === world) { setAssetLoadState((state) => ({ ...state, loaded: Math.min(state.total, state.loaded + 1) })); updateSelectionHelpers(); } invalidate();
        }).catch(() => { placeholderMesh.material.color.set("#d85e4b"); placeholder.userData.loadFailed = true; if (targetWorld === world) setAssetLoadState((state) => ({ ...state, loaded: Math.min(state.total, state.loaded + 1), failed: state.failed + 1 })); invalidate(); });
        const clearance = clearanceRect(item);
        if (clearance) {
          const marker = new THREE.Mesh(
            new THREE.PlaneGeometry(clearance.width, clearance.depth),
            new THREE.MeshBasicMaterial({ color: "#d8a24d", transparent: true, opacity: 0.22, depthWrite: false }),
          );
          marker.rotation.x = -Math.PI / 2;
          marker.position.set(clearance.x + clearance.width / 2, 6, clearance.z + clearance.depth / 2);
          world.add(marker);
        }
      }
      if (current.interactionMode === "outline") {
        const outlinePoints = current.room.outline.map((point) => new THREE.Vector3(point.x, 32, point.z));
        const outlineLine = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(outlinePoints),
          new THREE.LineBasicMaterial({ color: "#d37d26", linewidth: 2 }),
        );
        outlineLine.userData.decorative = true;
        world.add(outlineLine);
        current.room.outline.forEach((point, index) => {
          const next = current.room.outline[(index + 1) % current.room.outline.length];
          const handle = new THREE.Mesh(
            new THREE.CylinderGeometry(76, 76, 46, 20),
            new THREE.MeshStandardMaterial({ color: "#ef8a2f", emissive: "#5b2600", emissiveIntensity: 0.2 }),
          );
          handle.position.set((point.x + next.x) / 2, 28, (point.z + next.z) / 2);
          handle.userData.outlineIndex = index;
          world.add(handle);
        });
      }
      updateCamera();
      updateSelectionHelpers();
      invalidate();
      roomCache.set(activeRoomId, { world, furnitureById, roomReference: current.room, lastUsedAt: performance.now() });
      activeRoomReference = current.room;
      while (roomCache.size > 3) {
        const oldest = [...roomCache.entries()].filter(([id]) => id !== activeRoomId).sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)[0];
        if (!oldest) break; roomCache.delete(oldest[0]); disposeObjectTree(oldest[1].world);
      }
      if (idleHandle === null && current.rooms?.length) {
        const prewarm = () => {
          idleHandle = null;
          const assetIds = [...new Set(current.rooms!.filter((room) => room.id !== activeRoomId).flatMap((room) => room.items.map((item) => item.assetId)))].filter((id) => !prewarmedAssets.has(id));
          assetIds.forEach((id) => { prewarmedAssets.add(id); void loadFurnitureRuntime(id).catch(() => prewarmedAssets.delete(id)); });
        };
        idleHandle = requestIdle ? requestIdle(prewarm, { timeout: 1200 }) : window.setTimeout(prewarm, 250);
      }
    };

    const updateSelectionHelpers = () => {
      const helpers = world.children.filter((object) => object.userData.selectionHelper === true);
      helpers.forEach((object) => { world.remove(object); disposeObjectTree(object); });
      const current = propsRef.current;
      furnitureById.forEach((group, id) => {
        if (current.selectedId !== id && !current.collisionIds.has(id)) return;
        group.updateWorldMatrix(true, true);
        const helper = new THREE.BoxHelper(group, current.collisionIds.has(id) ? "#dc6549" : "#d89439");
        helper.userData.decorative = true; helper.userData.selectionHelper = true; world.add(helper);
      });
      invalidate();
    };

    const structureKey = (value: Props) => JSON.stringify({ id: value.room.id, dimensions: value.room.dimensions, outline: value.room.outline, bayWindow: value.room.bayWindow, doors: value.room.doors, keepOutZones: value.room.keepOutZones, showGrid: value.showGrid, showWalls: value.showWalls, outlineMode: value.interactionMode === "outline" });
    const runtimeKey = (item: FurnitureItem) => JSON.stringify({ assetId: item.assetId, size: item.size, color: item.color, parameterValues: item.parameterValues, stateId: item.stateId });
    const applyProps = (next: Props) => {
      const previous = renderedProps; renderedProps = next;
      if (previous.room.id !== next.room.id) markBedroomPerformance(BEDROOM_PERFORMANCE_MARKS.roomSwitchStart, { roomId: next.room.id });
      if (previous.viewMode !== next.viewMode) markBedroomPerformance(BEDROOM_PERFORMANCE_MARKS.viewSwitchStart, { viewMode: next.viewMode });
      const markVisible = () => requestAnimationFrame(() => {
        if (previous.room.id !== next.room.id) markBedroomPerformance(BEDROOM_PERFORMANCE_MARKS.roomSwitchVisible, { roomId: next.room.id });
        if (previous.viewMode !== next.viewMode) markBedroomPerformance(BEDROOM_PERFORMANCE_MARKS.viewSwitchVisible, { viewMode: next.viewMode });
      });
      if (structureKey(previous) !== structureKey(next) || previous.room.items.length !== next.room.items.length || next.room.items.some((item) => !previous.room.items.some((old) => old.id === item.id) || runtimeKey(item) !== runtimeKey(previous.room.items.find((old) => old.id === item.id)!))) { rebuild(); markVisible(); return; }
      for (const item of next.room.items) { const group = furnitureById.get(item.id); if (group) { group.position.set(item.position.x, item.baseHeight ?? (item.wallMounted ? 1450 : 0), item.position.z); group.rotation.y = THREE.MathUtils.degToRad(item.rotation); } }
      activeRoomReference = next.room;
      if (previous.viewMode !== next.viewMode || previous.room.id !== next.room.id) updateCamera();
      updateSelectionHelpers(); invalidate();
      markVisible();
    };

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
      perspective.aspect = width / height;
      updateCamera();
      invalidate();
    };
    const scheduleResize = (width = host.clientWidth, height = host.clientHeight) => {
      pendingWidth = width;
      pendingHeight = height;
      if (resizeFrame === null) resizeFrame = requestAnimationFrame(applyResize);
    };
    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const pick = (event: PointerEvent): { kind: "furniture" | "door"; id: string } | { kind: "outline"; index: number } | null => {
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(world.children, true);
      for (const hit of hits) {
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.furnitureId && !object.userData.doorId && object.userData.outlineIndex === undefined) object = object.parent;
        if (object?.userData.outlineIndex !== undefined) return { kind: "outline", index: object.userData.outlineIndex as number };
        if (object?.userData.furnitureId) return { kind: "furniture", id: object.userData.furnitureId as string };
        if (object?.userData.doorId) return { kind: "door", id: object.userData.doorId as string };
      }
      return null;
    };
    const canApplyItemPatch = (itemId: string, patch: Partial<FurnitureItem>) => {
      const current = propsRef.current;
      if (!current.collisionDetectionEnabled) return true;
      const candidateRoom: RoomLayout = {
        ...current.room,
        items: current.room.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
      };
      const candidate = candidateRoom.items.find((item) => item.id === itemId);
      return Boolean(candidate && !collides(candidate, candidateRoom));
    };
    const onPointerDown = (event: PointerEvent) => {
      renderer.domElement.setPointerCapture(event.pointerId);
      const targetObject = pick(event);
      if (targetObject?.kind === "outline" && propsRef.current.interactionMode === "outline") {
        propsRef.current.onSelect(null);
        draggingOutlineIndex = targetObject.index;
        outlineHistoryRecorded = false;
        renderer.domElement.style.cursor = "grabbing";
      } else if (targetObject?.kind === "door") {
        propsRef.current.onSelect(null);
        if (propsRef.current.interactionMode === "interact") propsRef.current.onToggleDoor(targetObject.id);
        renderer.domElement.style.cursor = propsRef.current.interactionMode === "interact" ? "pointer" : "default";
      } else if (targetObject?.kind === "furniture") {
        propsRef.current.onSelect(targetObject.id);
        if (propsRef.current.interactionMode === "interact") propsRef.current.onInteractItem(targetObject.id);
        if (propsRef.current.interactionMode === "move" || propsRef.current.interactionMode === "rotate") {
          draggingId = targetObject.id;
          dragAction = propsRef.current.interactionMode;
          dragHistoryRecorded = false;
          dragStartX = event.clientX;
          dragStartRotation = propsRef.current.room.items.find((item) => item.id === targetObject.id)?.rotation ?? 0;
          renderer.domElement.style.cursor = "grabbing";
        }
      } else if (propsRef.current.viewMode === "perspective") {
        propsRef.current.onSelect(null);
        orbiting = true;
        lastX = event.clientX;
        lastY = event.clientY;
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (draggingOutlineIndex !== null) {
        setPointer(event);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
          const current = propsRef.current;
          const point = current.room.outline[draggingOutlineIndex];
          const nextIndex = (draggingOutlineIndex + 1) % current.room.outline.length;
          const next = current.room.outline[nextIndex];
          const horizontal = Math.abs(next.x - point.x) >= Math.abs(next.z - point.z);
          const coordinate = Math.max(0, Math.min(20000, Math.round((horizontal ? hitPoint.z : hitPoint.x) / current.snap) * current.snap));
          const outline = current.room.outline.map((entry, index) => {
            if (index !== draggingOutlineIndex && index !== nextIndex) return entry;
            return horizontal ? { ...entry, z: coordinate } : { ...entry, x: coordinate };
          });
          const area = Math.abs(outline.reduce((sum, point, index) => {
            const next = outline[(index + 1) % outline.length];
            return sum + point.x * next.z - next.x * point.z;
          }, 0)) / 2;
          if (area >= 1_000_000 && isSimplePolygon(outline)) {
            current.onChangeOutline(outline, {
              recordHistory: !outlineHistoryRecorded,
              wallMove: { axis: horizontal ? "z" : "x", from: horizontal ? point.z : point.x, to: coordinate },
            });
            outlineHistoryRecorded = true;
          }
        }
      } else if (draggingId && dragAction === "move") {
        setPointer(event);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
          const current = propsRef.current;
          const item = current.room.items.find((entry) => entry.id === draggingId);
          if (!item) return;
          const { width, depth } = footprint(item);
          const x = Math.max(width / 2, Math.min(current.room.dimensions.width - width / 2, Math.round(hitPoint.x / current.snap) * current.snap));
          const z = Math.max(depth / 2, Math.min(current.room.dimensions.depth - depth / 2, Math.round(hitPoint.z / current.snap) * current.snap));
          const patch = { position: { x, z } };
          if (canApplyItemPatch(draggingId, patch)) {
            queueItemChange(draggingId, patch, !dragHistoryRecorded);
            dragHistoryRecorded = true;
          }
        }
      } else if (draggingId && dragAction === "rotate") {
        const rotation = Math.round((dragStartRotation + (event.clientX - dragStartX) * 0.6) / 5) * 5;
        const patch = { rotation: ((rotation % 360) + 360) % 360 };
        if (canApplyItemPatch(draggingId, patch)) {
          queueItemChange(draggingId, patch, !dragHistoryRecorded);
          dragHistoryRecorded = true;
        }
      } else if (orbiting) {
        azimuth -= (event.clientX - lastX) * 0.008;
        elevation = Math.max(0.28, Math.min(1.35, elevation + (event.clientY - lastY) * 0.006));
        lastX = event.clientX;
        lastY = event.clientY;
        updateCamera();
        invalidate();
      } else {
        const targetObject = pick(event);
        const mode = propsRef.current.interactionMode;
        renderer.domElement.style.cursor = targetObject?.kind === "outline"
          ? mode === "outline" ? "grab" : "default"
          : targetObject?.kind === "door"
          ? mode === "interact" ? "pointer" : "default"
          : targetObject?.kind === "furniture"
            ? mode === "interact" ? "pointer" : mode === "move" ? "grab" : "ew-resize"
            : propsRef.current.viewMode === "perspective" ? "move" : "default";
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      flushItemChange();
      draggingId = null;
      draggingOutlineIndex = null;
      dragAction = null;
      orbiting = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "default";
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (propsRef.current.viewMode === "perspective") {
        distance = Math.max(4200, Math.min(18000, distance + event.deltaY * 5));
      } else {
        orthographic.zoom = Math.max(0.55, Math.min(2.4, orthographic.zoom * (event.deltaY > 0 ? 0.92 : 1.08)));
        orthographic.updateProjectionMatrix();
      }
      updateCamera();
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(-1);
      scheduleResize(entry?.contentRect.width, entry?.contentRect.height);
    });
    observer.observe(host);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    rebuild();
    scheduleResize();
    markBedroomPerformance(BEDROOM_PERFORMANCE_MARKS.firstRoomReady, { roomId: propsRef.current.room.id });
    const controller = new RoomSceneController<Props>({ applyProps, invalidate, dispose: () => undefined });
    controller.applyProps(propsRef.current);
    (host as HTMLDivElement & { __bedroomState?: ViewportState }).__bedroomState = controller;

    return () => {
      buildRevision += 1;
      disposed = true;
      if (changeFrame !== null) cancelAnimationFrame(changeFrame);
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      changeFrame = null; pendingChange = null;
      controller.dispose();
      if (idleHandle !== null) { if (cancelIdle) cancelIdle(idleHandle); else window.clearTimeout(idleHandle); }
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      clearWorld();
      roomCache.forEach((entry) => { if (entry.world !== world) disposeObjectTree(entry.world); });
      roomCache.clear();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current as (HTMLDivElement & { __bedroomState?: ViewportState }) | null;
    host?.__bedroomState?.applyProps(props);
  }, [props.room, props.selectedId, props.collisionIds, props.viewMode, props.interactionMode, props.showGrid, props.showWalls, props.collisionDetectionEnabled]);

  if (webglUnavailable) {
    return <BedroomFallback2D {...props} />;
  }
  return <><div ref={hostRef} className="three-viewport" aria-label={`${props.room.name}三维布局编辑画布`} />{assetLoadState.loaded < assetLoadState.total && <div className="viewport-asset-progress" role="status">正在加载 {assetLoadState.loaded}/{assetLoadState.total} 件家具</div>}{assetLoadState.failed > 0 && <div className="viewport-asset-progress error" role="alert">{assetLoadState.failed} 件家具加载失败，已保留红色占位体</div>}</>;
}

function BedroomFallback2D({ room, selectedId, collisionIds, interactionMode, onSelect, onToggleDoor, onInteractItem }: Props) {
  const bay = room.bayWindow;
  const pad = Math.max(280, (bay?.depth ?? 0) + 120);
  const outline = room.outline.map((point) => `${point.x},${point.z}`).join(" ");
  return (
    <div className="three-viewport fallback-viewport" aria-label={`${room.name}平面兼容布局画布`}>
      <div className="fallback-notice">
        <strong>平面兼容模式</strong>
        <span>当前浏览器禁用了 WebGL；可继续选择家具和编辑参数。</span>
      </div>
      <svg
        className="fallback-plan"
        viewBox={`${-pad} ${-pad} ${room.dimensions.width + pad * 2} ${room.dimensions.depth + pad * 2}`}
        role="img"
        aria-label={`${room.name}平面布局`}
      >
        <defs>
          <pattern id="fallback-grid" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#d2cec4" strokeWidth="8" />
          </pattern>
        </defs>
        <polygon points={outline} fill="#faf7ef" stroke="#aaa399" strokeWidth="32" />
        <polygon points={outline} fill="url(#fallback-grid)" />
        {bay && <g className="fallback-bay-window">
          <rect
            x={bay.side === "bottom" ? bay.start : room.dimensions.width}
            y={bay.side === "bottom" ? room.dimensions.depth : bay.start}
            width={bay.side === "bottom" ? bay.length : bay.depth}
            height={bay.side === "bottom" ? bay.depth : bay.length}
            fill="#d8d0c3" stroke="#7c8992" strokeWidth="24"
          />
          <text
            x={bay.side === "bottom" ? bay.start + bay.length / 2 : room.dimensions.width + bay.depth / 2}
            y={bay.side === "bottom" ? room.dimensions.depth + bay.depth / 2 : bay.start + bay.length / 2}
            textAnchor="middle"
            className="fallback-zone-label"
          >飘窗台 H{bay.sillHeight}</text>
        </g>}
        {room.keepOutZones.map((zone) => <g key={zone.id}>
          <rect x={zone.x} y={zone.z} width={zone.width} height={zone.depth} fill="#df8d55" fillOpacity=".18" stroke="#cf7846" strokeWidth="14" strokeDasharray="46 30" />
          <text x={zone.x + zone.width / 2} y={zone.z + zone.depth / 2} textAnchor="middle" className="fallback-zone-label">{zone.label}</text>
        </g>)}
        {(room.doors ?? []).map((door) => {
          const closed = THREE.MathUtils.degToRad(door.closedAngle);
          const opened = THREE.MathUtils.degToRad(door.openAngle);
          const leafAngle = THREE.MathUtils.degToRad(door.isOpen === false ? door.closedAngle : door.openAngle);
          const start = { x: door.hinge.x + Math.cos(closed) * door.width, z: door.hinge.z + Math.sin(closed) * door.width };
          const end = { x: door.hinge.x + Math.cos(opened) * door.width, z: door.hinge.z + Math.sin(opened) * door.width };
          const leafEnd = { x: door.hinge.x + Math.cos(leafAngle) * door.width, z: door.hinge.z + Math.sin(leafAngle) * door.width };
          return <g key={door.id} className="fallback-door" role="button" tabIndex={0} onClick={() => { if (interactionMode === "interact") onToggleDoor(door.id); }} onKeyDown={(event) => { if (interactionMode === "interact" && (event.key === "Enter" || event.key === " ")) onToggleDoor(door.id); }}>
            <path d={`M ${door.hinge.x} ${door.hinge.z} L ${leafEnd.x} ${leafEnd.z}`} />
            <path d={`M ${start.x} ${start.z} A ${door.width} ${door.width} 0 0 ${door.openAngle > door.closedAngle ? 1 : 0} ${end.x} ${end.z}`} fill="none" strokeDasharray="30 22" />
          </g>;
        })}
        {room.items.map((item) => {
          const zone = clearanceRect(item);
          return zone ? <rect key={`${item.id}-clearance`} x={zone.x} y={zone.z} width={zone.width} height={zone.depth} fill="#d8a24d" fillOpacity=".2" stroke="#c58a2d" strokeWidth="12" strokeDasharray="36 24" /> : null;
        })}
        {room.items.map((item) => {
          const rotated = Math.abs(item.rotation % 180) === 90;
          const width = rotated ? item.size.depth : item.size.width;
          const depth = rotated ? item.size.width : item.size.depth;
          const warning = collisionIds.has(item.id);
          return (
            <g key={item.id} onClick={() => { onSelect(item.id); if (interactionMode === "interact") onInteractItem(item.id); }} className="fallback-item" role="button">
              <rect
                x={item.position.x - width / 2}
                y={item.position.z - depth / 2}
                width={width}
                height={depth}
                rx="40"
                fill={item.color}
                stroke={warning ? "#c95845" : selectedId === item.id ? "#d78b31" : "#8d857b"}
                strokeWidth={selectedId === item.id || warning ? 32 : 14}
              />
              <text x={item.position.x} y={item.position.z} textAnchor="middle" dominantBaseline="middle">{item.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
