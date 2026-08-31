"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createAssetGroup } from "@/lib/bedroom/asset-registry";
import { clearanceRect } from "@/lib/bedroom/geometry";
import { disposeObjectTree } from "@/lib/bedroom/three-disposal";
import type { FurnitureItem, InteractionMode, RoomLayout, ViewMode } from "@/lib/bedroom/types";

interface Props {
  room: RoomLayout;
  selectedId: string | null;
  collisionIds: Set<string>;
  viewMode: ViewMode;
  interactionMode: InteractionMode;
  snap: number;
  showGrid: boolean;
  showWalls: boolean;
  onSelect: (id: string | null) => void;
  onChangeItem: (id: string, patch: Partial<FurnitureItem>, options?: { recordHistory?: boolean }) => void;
  onToggleDoor: (id: string) => void;
  onInteractItem: (id: string) => void;
}

type ViewportState = { rebuild: () => void };

export function BedroomViewport(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

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
    let dragAction: "move" | "rotate" | null = null;
    let dragHistoryRecorded = false;
    let dragStartX = 0;
    let dragStartRotation = 0;
    let orbiting = false;
    let lastX = 0;
    let lastY = 0;
    let azimuth = 0.72;
    let elevation = 0.76;
    let distance = 9000;

    const clearWorld = () => {
      disposeObjectTree(world);
      world.clear();
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
      clearWorld();
      const current = propsRef.current;
      const { width, depth, height } = current.room.dimensions;
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
        const group = createAssetGroup(item);
        group.position.set(item.position.x, item.baseHeight ?? (item.wallMounted ? 1450 : 0), item.position.z);
        group.rotation.y = THREE.MathUtils.degToRad(item.rotation);
        world.add(group);
        if (current.selectedId === item.id || current.collisionIds.has(item.id)) {
          group.updateWorldMatrix(true, true);
          const helper = new THREE.BoxHelper(group, current.collisionIds.has(item.id) ? "#dc6549" : "#d89439");
          helper.userData.decorative = true;
          world.add(helper);
        }
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
    const pick = (event: PointerEvent): { kind: "furniture" | "door"; id: string } | null => {
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(world.children, true);
      for (const hit of hits) {
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.furnitureId && !object.userData.doorId) object = object.parent;
        if (object?.userData.furnitureId) return { kind: "furniture", id: object.userData.furnitureId as string };
        if (object?.userData.doorId) return { kind: "door", id: object.userData.doorId as string };
      }
      return null;
    };
    const onPointerDown = (event: PointerEvent) => {
      renderer.domElement.setPointerCapture(event.pointerId);
      const targetObject = pick(event);
      if (targetObject?.kind === "door") {
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
      if (draggingId && dragAction === "move") {
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
          current.onChangeItem(draggingId, { position: { x, z } }, { recordHistory: !dragHistoryRecorded });
          dragHistoryRecorded = true;
        }
      } else if (draggingId && dragAction === "rotate") {
        const rotation = Math.round((dragStartRotation + (event.clientX - dragStartX) * 0.6) / 5) * 5;
        propsRef.current.onChangeItem(draggingId, { rotation: ((rotation % 360) + 360) % 360 }, { recordHistory: !dragHistoryRecorded });
        dragHistoryRecorded = true;
      } else if (orbiting) {
        azimuth -= (event.clientX - lastX) * 0.008;
        elevation = Math.max(0.28, Math.min(1.35, elevation + (event.clientY - lastY) * 0.006));
        lastX = event.clientX;
        lastY = event.clientY;
        updateCamera();
      } else {
        const targetObject = pick(event);
        const mode = propsRef.current.interactionMode;
        renderer.domElement.style.cursor = targetObject?.kind === "door"
          ? mode === "interact" ? "pointer" : "default"
          : targetObject?.kind === "furniture"
            ? mode === "interact" ? "pointer" : mode === "move" ? "grab" : "ew-resize"
            : propsRef.current.viewMode === "perspective" ? "move" : "default";
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      draggingId = null;
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
  }, [props.room, props.selectedId, props.collisionIds, props.viewMode, props.interactionMode, props.showGrid, props.showWalls]);

  if (webglUnavailable) {
    return <BedroomFallback2D {...props} />;
  }
  return <div ref={hostRef} className="three-viewport" aria-label={`${props.room.name}三维布局编辑画布`} />;
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
