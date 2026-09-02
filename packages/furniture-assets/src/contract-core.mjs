const STATUS = new Set(["draft", "candidate", "approved", "archived"]);
const PARAMETER_TYPES = new Set(["number", "boolean", "enum", "color"]);
const EFFECTS = new Set(["geometry", "material", "visibility", "transform", "behavior", "dimensions"]);
const PURPOSES = ["scene", "review", "export"];
const SCOPES = new Set(["builtin", "user-generated"]);
const ORIGIN_METHODS = new Set(["img2threejs", "existing-procedural", "manual-procedural", "hybrid"]);
const CATEGORIES = new Set(["bed", "storage", "desk", "seat"]);

export function canonicalizeFurnitureContract(value) {
  if (Array.isArray(value)) return value.map(canonicalizeFurnitureContract);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeFurnitureContract(value[key])]));
}

export function furnitureCapabilityContract(manifest) {
  return canonicalizeFurnitureContract({
    defaultConfiguration: manifest.defaultConfiguration,
    appearance: manifest.appearance,
    dimensions: manifest.dimensions,
    dimensionConstraints: manifest.dimensionConstraints ?? {},
    parameterDefinitions: manifest.parameterDefinitions ?? [],
    states: manifest.states ?? [],
    components: manifest.components ?? [],
    capabilityBindings: manifest.capabilityBindings ?? [],
    validationConfigurations: manifest.validationConfigurations ?? [],
    designOverrides: manifest.designOverrides ?? [],
    footprintPolicy: manifest.footprintPolicy ?? { type: "configuration-dimensions" },
    clearancePolicy: manifest.clearancePolicy ?? { type: "none" },
    exportCapabilities: manifest.exportCapabilities,
  });
}

function positiveDimensions(value) {
  return Boolean(value && [value.width, value.depth, value.height].every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0));
}

function dimensionsEqual(left, right) {
  return positiveDimensions(left) && positiveDimensions(right) && ["width", "depth", "height"].every((axis) => left[axis] === right[axis]);
}

function parameterValueValid(definition, value) {
  if (definition.type === "number") return typeof value === "number" && Number.isFinite(value) && (definition.min === undefined || value >= definition.min) && (definition.max === undefined || value <= definition.max);
  if (definition.type === "boolean") return typeof value === "boolean";
  if (definition.type === "color") return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  if (definition.type === "enum") return typeof value === "string" && Array.isArray(definition.options) && definition.options.some((option) => option?.value === value);
  return false;
}

function configurationValue(configuration, parameterId) {
  return configuration?.parameters?.[parameterId];
}

function sameExceptCapability(left, right, capabilityId) {
  if (!left || !right || !dimensionsEqual(left.dimensions, right.dimensions)) return false;
  if (capabilityId.startsWith("state:")) {
    return JSON.stringify(canonicalizeFurnitureContract(left.parameters)) === JSON.stringify(canonicalizeFurnitureContract(right.parameters)) && left.stateId !== right.stateId;
  }
  const parameterId = capabilityId.slice("parameter:".length);
  if (left.stateId !== right.stateId || configurationValue(left, parameterId) === configurationValue(right, parameterId)) return false;
  const omit = (value) => Object.fromEntries(Object.entries(value?.parameters ?? {}).filter(([id]) => id !== parameterId));
  return JSON.stringify(canonicalizeFurnitureContract(omit(left))) === JSON.stringify(canonicalizeFurnitureContract(omit(right)));
}

function configurationMatchesDefault(configuration, manifest) {
  const expected = manifest.defaultConfiguration;
  return Boolean(expected && dimensionsEqual(configuration.dimensions, expected.dimensions) && configuration.stateId === expected.stateId && JSON.stringify(canonicalizeFurnitureContract(configuration.parameters)) === JSON.stringify(canonicalizeFurnitureContract(expected.parameters)));
}

export function validateFurnitureAssetManifest(manifest, { requireCandidateReady = false } = {}) {
  const issues = [];
  if (!manifest || typeof manifest !== "object") return ["manifest 必须是对象"];
  if (manifest.schemaVersion !== 3) issues.push("manifest 必须使用 schemaVersion 3");
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(manifest.id ?? "") || typeof manifest.name !== "string" || !manifest.name.trim() || !CATEGORIES.has(manifest.category)) issues.push("资产身份或分类无效");
  if (!STATUS.has(manifest.status)) issues.push("资产状态无效");
  if (!SCOPES.has(manifest.assetScope)) issues.push("资产范围无效");
  if (!ORIGIN_METHODS.has(manifest.origin?.method) || !["repository-trusted", "user-reviewed"].includes(manifest.lifecyclePolicy)) issues.push("资产生成方式或生命周期策略无效");
  if (manifest.origin?.sourceUrl !== undefined && typeof manifest.origin.sourceUrl !== "string" || manifest.origin?.sourceRevision !== undefined && typeof manifest.origin.sourceRevision !== "string") issues.push("资产来源引用无效");
  if (!/^#[0-9a-f]{6}$/i.test(manifest.appearance?.defaultColor ?? "")) issues.push("资产默认外观颜色无效");
  if (!manifest.footprintPolicy?.type || !manifest.clearancePolicy?.type) issues.push("占地或操作净空策略缺失");
  if (manifest.exportCapabilities?.formats?.length !== 1 || manifest.exportCapabilities.formats[0] !== "glb" || manifest.exportCapabilities.materialPolicy !== "portable-pbr" || typeof manifest.exportCapabilities.preserveComponentNodes !== "boolean") issues.push("导出能力声明无效");
  if (!Array.isArray(manifest.states) || !Array.isArray(manifest.parameterDefinitions) || !Array.isArray(manifest.components) || !Array.isArray(manifest.capabilityBindings) || !Array.isArray(manifest.validationConfigurations) || !Array.isArray(manifest.designOverrides)) issues.push("v3 能力数组不完整");
  if (issues.length) return issues;

  const stateIds = manifest.states.map((entry) => entry?.id);
  if (new Set(stateIds).size !== stateIds.length || manifest.states.some((entry) => !entry?.label || !/^[a-z][a-z0-9-]*$/.test(entry.id))) issues.push("状态 ID 无效或重复");
  const definitions = new Map();
  for (const definition of manifest.parameterDefinitions) {
    if (!definition?.label || !/^[a-z][a-zA-Z0-9]*$/.test(definition.id) || definitions.has(definition.id) || !PARAMETER_TYPES.has(definition.type) || !parameterValueValid(definition, definition.defaultValue)) issues.push(`参数 ${definition?.id ?? "<unknown>"} 定义无效`);
    else definitions.set(definition.id, definition);
  }
  const componentIds = new Set();
  for (const component of manifest.components) {
    if (!component?.label || !/^[a-z][a-zA-Z0-9]*$/.test(component.id) || componentIds.has(component.id) || !Array.isArray(component.nodeNames) || !component.nodeNames.length || component.nodeNames.some((name) => typeof name !== "string" || !name.trim()) || typeof component.movable !== "boolean" || component.movable && !component.pivotNode) issues.push(`组件 ${component?.id ?? "<unknown>"} 定义无效`);
    else componentIds.add(component.id);
  }
  const capabilityIds = new Set([...stateIds.map((id) => `state:${id}`), ...[...definitions.keys()].map((id) => `parameter:${id}`)]);
  if (manifest.footprintPolicy?.type === "state-overrides") for (const [stateId, footprint] of Object.entries(manifest.footprintPolicy.states ?? {})) {
    if (!stateIds.includes(stateId) || !(footprint.width > 0) || !(footprint.depth > 0)) issues.push(`状态 ${stateId} 的占地策略无效`);
  }
  if (manifest.clearancePolicy?.type === "front" && (!(manifest.clearancePolicy.depth === "half-width" || manifest.clearancePolicy.depth > 0) || !manifest.clearancePolicy.label?.trim() || manifest.clearancePolicy.activeStateIds?.some((id) => !stateIds.includes(id)))) issues.push("操作净空策略无效");
  const boundCapabilities = new Set();
  for (const binding of manifest.capabilityBindings) {
    if (!capabilityIds.has(binding?.capabilityId) || !Array.isArray(binding.componentIds) || !binding.componentIds.length || binding.componentIds.some((id) => !componentIds.has(id)) || !EFFECTS.has(binding.effect) || binding.activeStateIds?.some((id) => !stateIds.includes(id))) issues.push(`能力绑定 ${binding?.capabilityId ?? "<unknown>"} 无效`);
    else boundCapabilities.add(binding.capabilityId);
  }

  const configurationIds = new Set();
  const stateCoverage = new Set();
  const parameterCoverage = new Map([...definitions].map(([id]) => [id, new Set()]));
  for (const entry of manifest.validationConfigurations) {
    if (!entry?.id || configurationIds.has(entry.id) || !positiveDimensions(entry.dimensions) || !entry.parameters || typeof entry.parameters !== "object") { issues.push(`验证配置 ${entry?.id ?? "<unknown>"} 无效`); continue; }
    configurationIds.add(entry.id);
    if (manifest.states.length ? !stateIds.includes(entry.stateId) : entry.stateId !== null) issues.push(`验证配置 ${entry.id} 的状态无效`);
    if (entry.stateId) stateCoverage.add(entry.stateId);
    for (const [id, definition] of definitions) {
      const value = entry.parameters[id];
      if (!parameterValueValid(definition, value)) issues.push(`验证配置 ${entry.id} 的参数 ${id} 无效`);
      else parameterCoverage.get(id).add(JSON.stringify(value));
    }
    if (Object.keys(entry.parameters).some((id) => id !== "color" && !definitions.has(id))) issues.push(`验证配置 ${entry.id} 含未知参数`);
    if (entry.testsCapability && !capabilityIds.has(entry.testsCapability)) issues.push(`验证配置 ${entry.id} 引用了未知测试能力`);
    if (entry.compareAgainst && !manifest.validationConfigurations.some((candidate) => candidate.id === entry.compareAgainst)) issues.push(`验证配置 ${entry.id} 的比较基线不存在`);
  }

  const candidateRequired = requireCandidateReady || manifest.status === "candidate" || manifest.status === "approved";
  if (candidateRequired) {
    for (const capabilityId of capabilityIds) if (!boundCapabilities.has(capabilityId)) issues.push(`能力 ${capabilityId} 缺少组件绑定`);
    if (!manifest.validationConfigurations.some((entry) => configurationMatchesDefault(entry, manifest))) issues.push("验证配置未包含完整默认配置");
    if (manifest.states.some((state) => !stateCoverage.has(state.id))) issues.push("验证配置未覆盖全部状态");
    for (const [id, definition] of definitions) {
      const values = parameterCoverage.get(id);
      if (!values.has(JSON.stringify(definition.defaultValue))) issues.push(`参数 ${id} 未覆盖默认值`);
      if (definition.type === "boolean" && (!values.has("true") || !values.has("false"))) issues.push(`参数 ${id} 未覆盖 boolean 两值`);
      else if (definition.type === "enum") for (const option of definition.options) if (!values.has(JSON.stringify(option.value))) issues.push(`参数 ${id} 未覆盖枚举值 ${option.value}`);
      else if (values.size < 2) issues.push(`参数 ${id} 缺少非默认验证值`);
    }
    for (const capabilityId of capabilityIds) {
      const explicit = manifest.validationConfigurations.some((entry) => entry.testsCapability === capabilityId && sameExceptCapability(entry, manifest.validationConfigurations.find((candidate) => candidate.id === entry.compareAgainst), capabilityId));
      const inferred = manifest.validationConfigurations.some((left, index) => manifest.validationConfigurations.slice(index + 1).some((right) => sameExceptCapability(left, right, capabilityId)));
      if (!explicit && !inferred) issues.push(`能力 ${capabilityId} 缺少控制变量配对验证`);
    }
    if (!positiveDimensions(manifest.dimensions) || !positiveDimensions(manifest.defaultConfiguration?.dimensions)) issues.push("候选资产需要完整正数尺寸和默认配置");
    else if (!dimensionsEqual(manifest.dimensions, manifest.defaultConfiguration.dimensions)) issues.push("dimensions 必须与默认配置尺寸一致");
    if (!manifest.dimensionSource?.note?.trim()) issues.push("候选资产需要可靠尺寸来源");
    if (!manifest.qualityEvidence?.length) issues.push("候选资产需要质量证据");
    if (!manifest.validationConfigurations.length) issues.push("候选资产需要验证配置");
    if (manifest.states.length ? !stateIds.includes(manifest.defaultConfiguration?.stateId) : manifest.defaultConfiguration?.stateId !== null) issues.push("默认状态无效");
    for (const [id, definition] of definitions) if (!parameterValueValid(definition, manifest.defaultConfiguration?.parameters?.[id])) issues.push(`默认参数 ${id} 无效`);
    if (manifest.exportReady && manifest.exportIssue) issues.push("声明可导出 GLB 时不能同时存在 exportIssue");
  }
  return [...new Set(issues)];
}

export function furnitureCandidateReadinessIssues(manifest, contractHash) {
  const issues = validateFurnitureAssetManifest(manifest, { requireCandidateReady: true });
  const candidate = manifest.candidateEvidence;
  const runtime = manifest.runtimeEvidence;
  const exported = manifest.exportEvidence;
  if (!candidate || candidate.contractHash !== contractHash || !candidate.structuralChecksPassed || !candidate.behaviorChecksPassed || !candidate.runtimeChecksPassed || PURPOSES.some((purpose) => !candidate.purposesCovered?.includes(purpose))) issues.push("候选证据缺失、失败或已过期");
  if (!runtime || runtime.contractHash !== contractHash || runtime.runtimeAbiVersion !== 1 || !runtime.moduleLoaded || !runtime.resourcesVerified || !runtime.dimensionsMatch || !runtime.grounded || !runtime.namedNodesPreserved || !runtime.deterministic || !(runtime.configurationsTested > 0) || !/^[a-f0-9]{64}$/.test(runtime.artifactSetHash ?? "")) issues.push("浏览器 ESM 运行时证据缺失、失败或已过期");
  if (manifest.exportReady && (!exported || exported.contractHash !== contractHash || !exported.dimensionsMatch || !exported.grounded || !exported.namedNodesPreserved || !exported.materialsPortable || !exported.materialsAccepted || !exported.sourceReloadAppearanceAccepted || !exported.materialReviewPath || !exported.sourceReloadComparisonPath)) issues.push("已声明 GLB 可导出，但 GLB 证据缺失、失败或已过期");
  return [...new Set(issues)];
}
