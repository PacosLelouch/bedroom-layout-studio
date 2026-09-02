import * as THREE from "three";
import type { Dimensions3D } from "../types";
import type { FurnitureSourceModelFactory, ModelFitReport } from "./package-types";

const ASPECT_TOLERANCE = 0.05;
const REVIEW_LONGEST_AXIS = 1200;

function positiveDimensions(value: Dimensions3D | null | undefined): value is Dimensions3D {
  return Boolean(value && value.width > 0 && value.depth > 0 && value.height > 0);
}

function dimensionsFromVector(value: THREE.Vector3): Dimensions3D {
  return { width: value.x, depth: value.z, height: value.y };
}

export function createAdaptedGeneratedModel(
  factory: FurnitureSourceModelFactory,
  dimensions?: Dimensions3D | null,
  options: { strict?: boolean } = {},
): { group: THREE.Group; report: ModelFitReport } {
  const model = factory({ castShadow: true, receiveShadow: true, qualityPriority: "balanced" });
  model.updateMatrixWorld(true);

  const nativeBox = new THREE.Box3().setFromObject(model);
  const nativeSize = nativeBox.getSize(new THREE.Vector3());
  if (nativeSize.x <= 0 || nativeSize.y <= 0 || nativeSize.z <= 0) {
    throw new Error("生成模型没有可测量的三维包围盒。");
  }

  const target = positiveDimensions(dimensions) ? dimensions : null;
  const axisScale = target
    ? {
        width: target.width / nativeSize.x,
        depth: target.depth / nativeSize.z,
        height: target.height / nativeSize.y,
      }
    : (() => {
        const scale = REVIEW_LONGEST_AXIS / Math.max(nativeSize.x, nativeSize.y, nativeSize.z);
        return { width: scale, depth: scale, height: scale };
      })();

  const scaleValues = [axisScale.width, axisScale.depth, axisScale.height];
  const aspectDeviation = Math.max(...scaleValues) / Math.min(...scaleValues) - 1;
  const aspectCompatible = !target || aspectDeviation <= ASPECT_TOLERANCE;
  if (options.strict && !aspectCompatible) {
    throw new Error(`模型比例与尺寸上下文偏差 ${(aspectDeviation * 100).toFixed(1)}%，超过 5% 入库门槛。`);
  }

  model.scale.set(axisScale.width, axisScale.height, axisScale.depth);
  model.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
  model.position.x -= scaledCenter.x;
  model.position.y -= scaledBox.min.y;
  model.position.z -= scaledCenter.z;
  model.updateMatrixWorld(true);

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  const groundedBox = new THREE.Box3().setFromObject(model);
  const renderedSize = groundedBox.getSize(new THREE.Vector3());
  const wrapper = new THREE.Group();
  wrapper.name = `${model.name || "img2threejs-model"}-adapted`;
  wrapper.add(model);
  wrapper.userData.modelFit = {
    targetDimensions: target,
    aspectDeviation,
    aspectCompatible,
  };

  return {
    group: wrapper,
    report: {
      nativeDimensions: dimensionsFromVector(nativeSize),
      renderedDimensions: dimensionsFromVector(renderedSize),
      axisScale,
      aspectDeviation,
      aspectCompatible,
      grounded: Math.abs(groundedBox.min.y) < 0.001,
    },
  };
}

export function hasCompleteDimensions(value: Dimensions3D | null | undefined): value is Dimensions3D {
  return positiveDimensions(value);
}
