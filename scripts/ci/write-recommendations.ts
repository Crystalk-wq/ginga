import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Workflow = 'ci' | 'mergeable' | 'release';
type RecommendationStatus = 'complete' | 'present' | 'recommended';

type PackageManifest = {
  name?: unknown;
  version?: unknown;
  license?: unknown;
  packageManager?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  repository?: unknown;
  homepage?: unknown;
  bugs?: unknown;
  keywords?: unknown;
};

type PackageRecommendation = {
  name: string;
  ecosystem: 'npm';
  kind: 'devDependency';
  status: Extract<RecommendationStatus, 'present' | 'recommended'>;
  reason: string;
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..', '..');
const workflows: readonly Workflow[] = ['ci', 'mergeable', 'release'];

const packageCandidates = [
  {
    name: 'typescript',
    reason:
      'Run the strict tsconfig as a real compiler check in addition to Bun bundling.',
  },
  {
    name: '@types/bun',
    reason:
      'Provide explicit Bun and Node API types for the strict TypeScript sources.',
  },
] as const;

const featureCandidates = [
  {
    id: 'jpeg-progressive-and-subsampled',
    title: 'Extend JPEG support to chroma-subsampled and progressive streams',
    priority: 'high',
    source: 'docs/zig-engine.md#recommended-next-work',
  },
  {
    id: 'linear-working-image',
    title:
      'Introduce a richer linear working image representation beyond RGBA8',
    priority: 'medium',
    source: 'docs/zig-engine.md#recommended-next-work',
  },
  {
    id: 'golden-image-regressions',
    title:
      'Add golden-image regression tests for rendering and codec round trips',
    priority: 'high',
    source: 'docs/zig-engine.md#recommended-next-work',
  },
  {
    id: 'spd-export-tooling',
    title: 'Add SPD export tooling after the interchange contract is settled',
    priority: 'medium',
    source: 'docs/zig-engine.md#recommended-next-work',
  },
] as const;

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`package.json ${field} must be a non-empty string`);
  }
  return value;
}

function parseWorkflow(value: string | undefined): Workflow {
  if (!workflows.includes(value as Workflow)) {
    throw new Error(
      'usage: bun scripts/ci/write-recommendations.ts <ci|mergeable|release>',
    );
  }
  return value as Workflow;
}

function parseBuildVersion(text: string): string {
  const match = text.match(/\.version\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error('build.zig.zon is missing .version');
  }
  return match[1];
}

function parseLatestChangelogVersion(text: string): string {
  const match = text.match(/^## \[([^\]]+)\]/m);
  if (!match) {
    throw new Error('CHANGELOG.md is missing a version heading');
  }
  return match[1];
}

function generatedAt(): string {
  const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
  if (!sourceDateEpoch) {
    return new Date().toISOString();
  }

  const epochSeconds = Number(sourceDateEpoch);
  if (!Number.isFinite(epochSeconds) || epochSeconds < 0) {
    throw new Error('SOURCE_DATE_EPOCH must be a non-negative number');
  }
  return new Date(epochSeconds * 1000).toISOString();
}

function gitHead(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function hasMetadataValue(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return (
    value !== null && typeof value === 'object' && Object.keys(value).length > 0
  );
}

function packageRecommendations(
  manifest: PackageManifest,
): PackageRecommendation[] {
  const installedPackages = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);

  return packageCandidates.map((candidate) => ({
    name: candidate.name,
    ecosystem: 'npm',
    kind: 'devDependency',
    status: installedPackages.has(candidate.name) ? 'present' : 'recommended',
    reason: candidate.reason,
  }));
}

async function main(): Promise<void> {
  const workflow = parseWorkflow(process.argv[2]);
  const [packageText, buildZonText, changelogText] = await Promise.all([
    readFile(path.join(repoRoot, 'package.json'), 'utf8'),
    readFile(path.join(repoRoot, 'build.zig.zon'), 'utf8'),
    readFile(path.join(repoRoot, 'CHANGELOG.md'), 'utf8'),
  ]);

  const manifest = JSON.parse(packageText) as PackageManifest;
  const packageVersion = requireString(manifest.version, 'version');
  const buildVersion = parseBuildVersion(buildZonText);
  const changelogVersion = parseLatestChangelogVersion(changelogText);
  const metadataFields = [
    'repository',
    'homepage',
    'bugs',
    'keywords',
  ] as const;
  const missingMetadata = metadataFields.filter(
    (field) => !hasMetadataValue(manifest[field]),
  );
  const versionsAligned =
    packageVersion === buildVersion && packageVersion === changelogVersion;

  const report = {
    schemaVersion: 1,
    kind: 'ginga.workflow-recommendations',
    generatedAt: generatedAt(),
    workflow,
    run: {
      repository: process.env.GITHUB_REPOSITORY ?? 'local',
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      event: process.env.GITHUB_EVENT_NAME ?? 'local',
      ref: process.env.GITHUB_REF_NAME ?? process.env.GITHUB_REF ?? null,
      commit: process.env.GITHUB_SHA ?? gitHead(),
    },
    project: {
      name: requireString(manifest.name, 'name'),
      packageVersion,
      buildVersion,
      changelogVersion,
      packageManager: requireString(manifest.packageManager, 'packageManager'),
      license: requireString(manifest.license, 'license'),
    },
    recommendations: {
      packages: packageRecommendations(manifest),
      metadata: [
        {
          id: 'package-discovery-metadata',
          status: missingMetadata.length === 0 ? 'complete' : 'recommended',
          missingFields: missingMetadata,
          reason:
            missingMetadata.length === 0
              ? 'Package discovery metadata is complete.'
              : 'Add these package.json fields so repository and support links are machine discoverable.',
        },
        {
          id: 'release-version-alignment',
          status: versionsAligned ? 'complete' : 'recommended',
          versions: {
            package: packageVersion,
            build: buildVersion,
            changelog: changelogVersion,
          },
          reason: versionsAligned
            ? 'Package, build, and changelog versions are aligned.'
            : 'Align package.json, build.zig.zon, and the latest changelog version before release.',
        },
      ],
      features: featureCandidates,
    },
  };

  if (
    report.recommendations.packages.length === 0 ||
    report.recommendations.features.length === 0
  ) {
    throw new Error(
      'recommendations report must contain package and feature candidates',
    );
  }

  const configuredReportDir = process.env.REPORT_DIR ?? '.reports';
  const reportDir = path.isAbsolute(configuredReportDir)
    ? configuredReportDir
    : path.join(repoRoot, configuredReportDir);
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, 'recommendations.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

await main();
