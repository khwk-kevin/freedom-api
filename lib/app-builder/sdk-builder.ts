/**
 * Freedom World App Builder — SDK-based Code Builder
 *
 * Replaces Claude Code CLI on the build container with direct Anthropic SDK calls
 * from the API server. Uses the same auth as the /apps/chat endpoint.
 *
 * Flow:
 *   1. Read vault files + template source from build container
 *   2. Send as context to Anthropic Messages API
 *   3. Parse response for file writes
 *   4. Write generated files back to build container
 */

import Anthropic from '@anthropic-ai/sdk';
import { sshExecCommand, sshWriteFile } from './railway';

// ============================================================
// ANTHROPIC CLIENT (same auth as chat.ts)
// ============================================================

function getClient(): Anthropic {
  // Prefer OAuth token (ANTHROPIC_AUTH_TOKEN) — same tokens powering OpenClaw/AVA
  // Falls back to API key if no OAuth token is set
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN || null;
  const apiKey = process.env.ANTHROPIC_API_KEY || null;

  if (!authToken && !apiKey) {
    throw new Error('No Anthropic credentials configured (need ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY)');
  }

  return new Anthropic({ authToken, apiKey });
}

// ============================================================
// FILE I/O ON BUILD CONTAINER
// ============================================================

const BUILD_PROJECT_ID = process.env.BUILD_SERVICE_PROJECT_ID ?? '';
const BUILD_SERVICE_ID = process.env.BUILD_SERVICE_ID ?? '';

async function readBuildFile(merchantId: string, filePath: string): Promise<string | null> {
  const fullPath = `/workspace/builds/${merchantId}/${filePath}`;
  const result = await sshExecCommand(BUILD_PROJECT_ID, BUILD_SERVICE_ID, `cat "${fullPath}" 2>/dev/null`);
  if (result.exitCode !== 0) return null;
  return result.stdout;
}

async function writeBuildFileContent(merchantId: string, filePath: string, content: string): Promise<void> {
  const fullPath = `/workspace/builds/${merchantId}/${filePath}`;
  // Ensure directory exists
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  await sshExecCommand(BUILD_PROJECT_ID, BUILD_SERVICE_ID, `mkdir -p "${dir}"`);
  await sshWriteFile(BUILD_PROJECT_ID, BUILD_SERVICE_ID, fullPath, content);
}

async function listBuildFiles(merchantId: string, pattern: string): Promise<string[]> {
  const buildDir = `/workspace/builds/${merchantId}`;
  const result = await sshExecCommand(
    BUILD_PROJECT_ID, BUILD_SERVICE_ID,
    `find "${buildDir}" -maxdepth 5 -not -path '*/node_modules/*' -not -path '*/.git/*' -type f -name "${pattern}" 2>/dev/null | sed 's|${buildDir}/||'`
  );
  if (result.exitCode !== 0 || !result.stdout.trim()) return [];
  return result.stdout.trim().split('\n').filter(Boolean);
}

// ============================================================
// GATHER CONTEXT FROM BUILD CONTAINER
// ============================================================

interface BuildContext {
  claudeMd: string;
  vaultFiles: { path: string; content: string }[];
  templateFiles: { path: string; content: string }[];
}

async function gatherBuildContext(merchantId: string): Promise<BuildContext> {
  // Read CLAUDE.md (the main spec)
  const claudeMd = await readBuildFile(merchantId, 'CLAUDE.md') || '';

  // Read all vault files (context/, design/, skills/)
  const vaultPaths = [
    'context/brand.md',
    'context/business.md',
    'context/audience.md',
    'design/theme.json',
    'design/components.md',
    'design/system.md',
    'skills/_active.md',
  ];

  const vaultFiles: { path: string; content: string }[] = [];
  for (const p of vaultPaths) {
    const content = await readBuildFile(merchantId, p);
    if (content) vaultFiles.push({ path: p, content });
  }

  // Read existing template source files
  const templatePaths = [
    'src/app/page.tsx',
    'src/app/layout.tsx',
    'src/app/globals.css',
    'src/lib/utils.ts',
    'src/lib/design/theme.tsx',
    'src/components/variants/mood-map.ts',
    'src/components/variants/index.ts',
    'package.json',
    'tsconfig.json',
    'next.config.ts',
  ];

  const templateFiles: { path: string; content: string }[] = [];
  for (const p of templatePaths) {
    const content = await readBuildFile(merchantId, p);
    if (content) templateFiles.push({ path: p, content });
  }

  // Also list available shadcn/ui components
  const uiComponents = await listBuildFiles(merchantId, '*.tsx');
  const uiComponentPaths = uiComponents.filter(f => f.startsWith('src/components/ui/'));

  if (uiComponentPaths.length > 0) {
    vaultFiles.push({
      path: '_available_components.txt',
      content: `Available shadcn/ui components:\n${uiComponentPaths.map(p => `- ${p}`).join('\n')}`,
    });
  }

  return { claudeMd, vaultFiles, templateFiles };
}

// ============================================================
// PARSE AI RESPONSE INTO FILE WRITES
// ============================================================

interface FileWrite {
  path: string;
  content: string;
}

/**
 * Parse the AI response for file blocks.
 * Expected format:
 *   === FILE: src/app/page.tsx ===
 *   ```tsx
 *   ... content ...
 *   ```
 */
function parseFileWrites(response: string): FileWrite[] {
  const files: FileWrite[] = [];
  // Match === FILE: path === followed by a code block
  const filePattern = /===\s*FILE:\s*([^\s=]+)\s*===\s*\n```(?:\w+)?\n([\s\S]*?)```/g;
  let match;
  while ((match = filePattern.exec(response)) !== null) {
    const path = match[1].trim();
    const content = match[2];
    if (path && content) {
      files.push({ path, content });
    }
  }
  return files;
}

// ============================================================
// MAIN BUILD FUNCTION
// ============================================================

/**
 * Run a build pass using the Anthropic SDK.
 * Replaces runClaudeCodeBuild() — no CLI, no build container auth needed.
 *
 * @param merchantId  Build directory name on the build container
 * @param prompt      What to build/review/fix
 * @param context     Pre-gathered build context (optional — will gather if not provided)
 * @returns           { success, filesWritten, response }
 */
export async function runSdkBuild(
  merchantId: string,
  prompt: string,
  context?: BuildContext
): Promise<{ success: boolean; filesWritten: number; response: string; error?: string }> {
  const client = getClient();

  // Gather context if not provided
  const ctx = context || await gatherBuildContext(merchantId);

  // Build the system prompt with all context
  const systemParts: string[] = [
    'You are an expert frontend developer building a custom Next.js app.',
    'You have been given a complete app specification and template source code.',
    'Your job is to write/modify source files to build the app described in CLAUDE.md.',
    '',
    'CRITICAL RULES:',
    '1. Output ONLY file contents in this exact format:',
    '   === FILE: path/to/file.tsx ===',
    '   ```tsx',
    '   ... full file content ...',
    '   ```',
    '2. Write COMPLETE files — never use "// ... rest stays the same" or partial snippets.',
    '3. Every component with state or effects MUST have "use client" at the top.',
    '4. Use Tailwind CSS classes. Never hardcode hex colors — use CSS variables from globals.css.',
    '5. Import from the available shadcn/ui components listed below.',
    '6. TypeScript must compile with zero errors.',
    '7. All content must be real data from the spec — NO placeholder text.',
    '8. Mobile-first: everything must work at 375px viewport width.',
    '',
  ];

  // Add CLAUDE.md
  if (ctx.claudeMd) {
    systemParts.push('=== CLAUDE.md (APP SPECIFICATION) ===');
    systemParts.push(ctx.claudeMd);
    systemParts.push('');
  }

  // Add vault files
  for (const f of ctx.vaultFiles) {
    systemParts.push(`=== ${f.path} ===`);
    systemParts.push(f.content);
    systemParts.push('');
  }

  // Add template files as reference
  systemParts.push('=== EXISTING SOURCE FILES (for reference) ===');
  for (const f of ctx.templateFiles) {
    // Truncate very long files
    const maxLen = 3000;
    const content = f.content.length > maxLen
      ? f.content.slice(0, maxLen) + '\n// ... truncated ...'
      : f.content;
    systemParts.push(`--- ${f.path} ---`);
    systemParts.push(content);
    systemParts.push('');
  }

  const systemPrompt = systemParts.join('\n');

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('');

    // Parse file writes from response
    const files = parseFileWrites(text);

    if (files.length === 0) {
      console.warn(`[sdk-builder] No file blocks found in response for ${merchantId}. Response length: ${text.length}`);
      // The AI might have just written code without the file markers — try to detect
      // a single page.tsx in the response
      const singleFileMatch = text.match(/```(?:tsx?)\n([\s\S]*?)```/);
      if (singleFileMatch) {
        files.push({ path: 'src/app/page.tsx', content: singleFileMatch[1] });
        console.log(`[sdk-builder] Extracted single code block as page.tsx for ${merchantId}`);
      }
    }

    // Write all files to build container
    let written = 0;
    for (const file of files) {
      try {
        await writeBuildFileContent(merchantId, file.path, file.content);
        written++;
        console.log(`[sdk-builder] Wrote ${file.path} (${file.content.length} bytes)`);
      } catch (err) {
        console.error(`[sdk-builder] Failed to write ${file.path}:`, err);
      }
    }

    // Fix ownership for builder user
    await sshExecCommand(
      BUILD_PROJECT_ID, BUILD_SERVICE_ID,
      `chown -R builder:builder /workspace/builds/${merchantId}`
    );

    return {
      success: written > 0,
      filesWritten: written,
      response: text,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[sdk-builder] Anthropic API error for ${merchantId}:`, error);
    return {
      success: false,
      filesWritten: 0,
      response: '',
      error,
    };
  }
}

/**
 * Multi-pass build: build → review → polish.
 * Drop-in replacement for the 3-pass Claude Code approach in deploy.ts.
 */
export async function runFullSdkBuild(
  merchantId: string,
  spec: {
    businessName?: string;
    businessType?: string;
    ideaDescription?: string;
    primaryColor?: string;
    mood?: string;
    uiStyle?: string;
    products?: { name: string; price?: string | number; description?: string }[];
    audienceDescription?: string;
    conversionGoal?: string;
    coreActions?: string[];
    userJourney?: string;
  },
  onProgress?: (step: string, message: string) => void
): Promise<{ success: boolean; filesWritten: number; error?: string }> {
  const progress = onProgress ?? (() => {});

  // Gather context once, reuse across passes
  const context = await gatherBuildContext(merchantId);

  const businessType = spec.businessType || 'app';
  const businessName = spec.businessName || 'the app';
  const description = spec.ideaDescription || `a ${businessType} app`;
  const primaryColor = spec.primaryColor || '#10F48B';
  const mood = spec.mood || 'modern';
  const uiStyle = spec.uiStyle || 'outlined';

  const productNames = spec.products?.slice(0, 5).map(p => p.name).join(', ') || '';
  const productHint = productNames ? ` Products/items: ${productNames}.` : '';
  const audienceHint = spec.audienceDescription ? ` Target audience: ${spec.audienceDescription}.` : '';

  // ── Pass 1: Build ──────────────────────────────────────────
  progress('build_start', 'Building your app with AI...');

  const buildPrompt =
    `Build "${businessName}" — ${description}. ` +
    `This is a UNIQUE ${businessType} app, NOT a generic template.${productHint}${audienceHint} ` +
    `Design: ${mood} mood, ${uiStyle} style, primary color ${primaryColor}. ` +
    `Use the background color from design/theme.json — do NOT assume dark theme. ` +
    `Use real data from context/business.md. No placeholder text. Mobile-first. ` +
    `Write src/app/page.tsx (the main app page) and src/app/layout.tsx (with correct title/metadata). ` +
    `If the app needs multiple sections, put them all in page.tsx as a single-page app with scroll sections.` +
    `\n\nOutput each file using:\n=== FILE: path/to/file ===\n\`\`\`tsx\n... content ...\n\`\`\``;

  const buildResult = await runSdkBuild(merchantId, buildPrompt, context);
  if (!buildResult.success) {
    progress('build_failed', 'Build had issues, attempting fix...');
    return { success: false, filesWritten: 0, error: buildResult.error || 'Build pass failed' };
  }
  progress('build_done', 'App built ✓');

  // Re-gather context with newly written files for review passes
  const updatedContext = await gatherBuildContext(merchantId);

  // ── Pass 2: Self-Review ────────────────────────────────────
  progress('review_start', 'Reviewing against your requirements...');

  const reviewPrompt =
    `Review the app you just built against the CLAUDE.md specification. Check:\n` +
    `1. Does the homepage hero mention "${businessName}"?\n` +
    `2. Are all products from context/business.md displayed with real names and prices?\n` +
    `3. Is the primary color ${primaryColor} used correctly?\n` +
    `4. Is the layout unique to a ${businessType} business?\n` +
    `5. Is there a clear CTA on the homepage?\n` +
    `6. Does mobile work at 375px?\n` +
    `7. Are there any placeholder texts like "Lorem ipsum" or "Your Business"?\n` +
    `\nFix any issues by outputting corrected files using:\n=== FILE: path/to/file ===\n\`\`\`tsx\n... content ...\n\`\`\`\n` +
    `If everything looks good, output the same files with improvements.`;

  const reviewResult = await runSdkBuild(merchantId, reviewPrompt, updatedContext);
  if (!reviewResult.success) {
    console.warn(`[sdk-builder] Pass 2 (review) produced no files for ${merchantId} — continuing.`);
  }
  progress('review_done', 'Review complete ✓');

  // ── Pass 3: QA & Polish ────────────────────────────────────
  progress('polish_start', 'Final polish...');

  const finalContext = await gatherBuildContext(merchantId);
  const polishPrompt =
    `Final QA pass. Check the current page.tsx and fix:\n` +
    `1. Remove any remaining placeholder text\n` +
    `2. Ensure all images use paths in /public/assets/ or gradient placeholders\n` +
    `3. Check buttons have hover states\n` +
    `4. Verify primary CTA is above the fold on mobile\n` +
    `5. Ensure consistent spacing and typography\n` +
    `6. Make sure all TypeScript types are correct\n` +
    `\nOutput corrected files using:\n=== FILE: path/to/file ===\n\`\`\`tsx\n... content ...\n\`\`\``;

  const polishResult = await runSdkBuild(merchantId, polishPrompt, finalContext);
  if (!polishResult.success) {
    console.warn(`[sdk-builder] Pass 3 (polish) produced no files for ${merchantId} — continuing.`);
  }
  progress('polish_done', 'Polish complete ✓');

  const totalFiles = buildResult.filesWritten + (reviewResult.filesWritten || 0) + (polishResult.filesWritten || 0);
  return { success: true, filesWritten: totalFiles };
}
