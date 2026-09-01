import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { computeFurnitureAssetContractHash, readFurniturePackageContractSources } from "../../../../scripts/furniture-asset-contract.mjs";

const run = promisify(execFile);
const projectRoot = process.cwd();
const assetId = process.argv[2];
const materialsAccepted = process.argv.includes("--materials-accepted");
const appearanceAccepted = process.argv.includes("--appearance-accepted");
const materialEvidenceIndex = process.argv.indexOf("--material-evidence");
const appearanceEvidenceIndex = process.argv.indexOf("--appearance-evidence");
const materialEvidence = materialEvidenceIndex >= 0 ? path.resolve(projectRoot, process.argv[materialEvidenceIndex + 1]) : null;
const appearanceEvidence = appearanceEvidenceIndex >= 0 ? path.resolve(projectRoot, process.argv[appearanceEvidenceIndex + 1]) : null;
const skipProjectChecks = process.argv.includes("--skip-project-checks");
if (!assetId || !materialsAccepted || !appearanceAccepted || !materialEvidence || !appearanceEvidence) throw new Error("Usage: node admit_furniture_candidate.mjs <asset-id> [--scope builtin|user-generated] --materials-accepted --material-evidence <path> --appearance-accepted --appearance-evidence <path> [--skip-project-checks]");
const scopeIndex = process.argv.indexOf("--scope");
const assetScope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : "user-generated";
if (!["builtin", "user-generated"].includes(assetScope)) throw new Error("--scope 必须是 builtin 或 user-generated");
const assetDir = path.resolve(projectRoot, "lib", "bedroom", "assets", assetScope, assetId);
const manifestPath = path.join(assetDir, "asset.json");
const evidenceDir = path.join(assetDir, "evidence");
const candidateReportPath = path.join(evidenceDir, "candidate-report.json");
const glbReportPath = path.join(evidenceDir, "glb-report.json");
const originalText = await readFile(manifestPath, "utf8");
const original = JSON.parse(originalText);
const proposed = { ...original, status: "draft", exportReady: true, exportIssue: undefined, candidateEvidence: null, exportEvidence: null, approvedFactoryHash: null, reviewedAt: null };
if (proposed.assetScope !== assetScope) throw new Error(`assetScope 必须是 ${assetScope}`);
const { modelSource, runtimeSource } = await readFurniturePackageContractSources(assetDir);
const contractHash = computeFurnitureAssetContractHash(modelSource, runtimeSource, proposed);

async function readAcceptedEvidence(filePath, kind) {
  let evidence;
  try { evidence = JSON.parse(await readFile(filePath, "utf8")); }
  catch { throw new Error(`${kind} 证据必须是 JSON envelope`); }
  if (evidence.schemaVersion !== 1 || evidence.kind !== kind || evidence.assetId !== assetId || evidence.contractHash !== contractHash || evidence.result !== "accepted") throw new Error(`${kind} 证据与当前资产契约不匹配或尚未接受`);
  const expectedConfigurations = proposed.validationConfigurations.map((entry) => entry.id);
  if (!Array.isArray(evidence.configurationIds) || expectedConfigurations.some((id) => !evidence.configurationIds.includes(id))) throw new Error(`${kind} 证据未覆盖全部验证配置`);
  if (kind === "source-reload-comparison" && (!evidence.cameraHash || !evidence.lightingPreset || !evidence.sourceImage || !evidence.reloadedImage)) throw new Error("外观比较证据缺少同机位、灯光或对比图引用");
  return evidence;
}

async function atomicJson(filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, filePath);
}

await mkdir(evidenceDir, { recursive: true });
try {
  await atomicJson(manifestPath, proposed);
  const materialEvidenceEnvelope = await readAcceptedEvidence(materialEvidence, "material-review");
  const appearanceEvidenceEnvelope = await readAcceptedEvidence(appearanceEvidence, "source-reload-comparison");
  const validateScript = path.join(import.meta.dirname, "validate_furniture_asset.mjs");
  const smokeScript = path.join(import.meta.dirname, "smoke_export_glb.mjs");
  await run(process.execPath, [validateScript, assetId, "--scope", assetScope, "--candidate", "--out", candidateReportPath], { cwd: projectRoot });
  await run(process.execPath, [smokeScript, assetId, "--scope", assetScope, "--out", glbReportPath], { cwd: projectRoot });
  const candidateReport = JSON.parse(await readFile(candidateReportPath, "utf8"));
  const glbReport = JSON.parse(await readFile(glbReportPath, "utf8"));
  glbReport.materialsAccepted = true;
  glbReport.sourceReloadAppearanceAccepted = true;
  if (candidateReport.contractHash !== contractHash || glbReport.contractHash !== contractHash) throw new Error("验证期间能力契约发生变化");
  const now = new Date().toISOString();
  const admitted = {
    ...proposed,
    status: "candidate",
    candidateEvidence: {
      reportPath: path.relative(projectRoot, candidateReportPath).replaceAll("\\", "/"), verifiedAt: now, contractHash,
      configurationCount: candidateReport.configurations.length, statesCovered: candidateReport.statesCovered,
      parametersCovered: candidateReport.parametersCovered, purposesCovered: candidateReport.purposesCovered,
      structuralChecksPassed: true, behaviorChecksPassed: true, glbChecksPassed: true,
    },
    exportEvidence: {
      reportPath: path.relative(projectRoot, glbReportPath).replaceAll("\\", "/"), verifiedAt: now, contractHash,
      configurationsTested: glbReport.configurationsTested, stateIds: glbReport.stateIds,
      dimensionsMatch: glbReport.dimensionsMatch, grounded: glbReport.grounded,
      namedNodesPreserved: glbReport.namedNodesPreserved, materialsPortable: glbReport.materialsPortable,
      materialsAccepted: true, sourceReloadAppearanceAccepted: true,
      materialReviewPath: path.relative(projectRoot, materialEvidence).replaceAll("\\", "/"),
      sourceReloadComparisonPath: path.relative(projectRoot, appearanceEvidence).replaceAll("\\", "/"),
    },
  };
  await atomicJson(candidateReportPath, { ...candidateReport, verifiedAt: now });
  await atomicJson(glbReportPath, { ...glbReport, verifiedAt: now, materialEvidence: materialEvidenceEnvelope, appearanceEvidence: appearanceEvidenceEnvelope });
  await atomicJson(manifestPath, admitted);
  await run(process.execPath, [path.join(projectRoot, "scripts", "sync-furniture-assets.mjs")], { cwd: projectRoot });
  if (!skipProjectChecks) {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    await run(npm, ["run", "assets:check"], { cwd: projectRoot });
    await run(npm, ["run", "build"], { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 });
  }
  console.log(`Furniture asset ${assetId} is technically ready and registered as candidate.`);
} catch (error) {
  const failureMessage = error instanceof Error ? error.message : String(error);
  const failedDraft = {
    ...original,
    status: "draft",
    exportReady: false,
    exportIssue: `Candidate admission failed: ${failureMessage}`,
    candidateEvidence: null,
    exportEvidence: null,
    approvedFactoryHash: null,
    reviewedAt: null,
  };
  await atomicJson(manifestPath, failedDraft);
  try {
    await run(process.execPath, [path.join(projectRoot, "scripts", "sync-furniture-assets.mjs")], { cwd: projectRoot });
  } catch (syncError) {
    const syncMessage = syncError instanceof Error ? syncError.message : String(syncError);
    throw new AggregateError([error, syncError], `候选准入失败，manifest 已降为 draft，但 registry 回滚同步失败：${syncMessage}`);
  }
  throw error;
}
