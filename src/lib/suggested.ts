/**
 * Curated catalog offered from the "Suggested" action in Skills and MCP settings.
 *
 * Content division:
 * - Agent content (names, skill instructions, MCP commands and arguments) is part of
 *   the codebase and prompt context, so it is strictly kept in English.
 * - User-facing explanations (descriptions and requirement warnings) are UI strings
 *   and reference i18n keys so they are translated into the user's active language.
 */
import type { McpServer, Skill } from "@/types";

export type SuggestedMcp = Omit<McpServer, "id" | "enabledFor"> & {
  /** i18n key of the one-line description shown in the picker. */
  descriptionKey: string;
  /** i18n key of the warning shown when the entry needs editing before it works. */
  requiresKey?: string;
};

export type SuggestedSkill = Omit<Skill, "id" | "enabledFor" | "description"> & {
  descriptionKey: string;
};

export const SUGGESTED_MCP: SuggestedMcp[] = [
  {
    name: "Filesystem",
    descriptionKey: "suggested.mcp.filesystem.description",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "<folder>"],
    requiresKey: "suggested.mcp.filesystem.requires",
  },
  {
    name: "GitHub",
    descriptionKey: "suggested.mcp.github.description",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    requiresKey: "suggested.mcp.github.requires",
  },
  {
    name: "Git",
    descriptionKey: "suggested.mcp.git.description",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-git"],
    requiresKey: "suggested.mcp.git.requires",
  },
  {
    name: "Fetch",
    descriptionKey: "suggested.mcp.fetch.description",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-fetch"],
    requiresKey: "suggested.mcp.fetch.requires",
  },
  {
    name: "Memory",
    descriptionKey: "suggested.mcp.memory.description",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
  },
  {
    name: "Sequential Thinking",
    descriptionKey: "suggested.mcp.sequential-thinking.description",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
  },
  {
    name: "Playwright",
    descriptionKey: "suggested.mcp.playwright.description",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
  },
  {
    name: "Context7",
    descriptionKey: "suggested.mcp.context7.description",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
  },
  {
    name: "PostgreSQL",
    descriptionKey: "suggested.mcp.postgresql.description",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres", "<connection-string>"],
    requiresKey: "suggested.mcp.postgresql.requires",
  },
  {
    name: "SQLite",
    descriptionKey: "suggested.mcp.sqlite.description",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-sqlite", "--db-path", "<file.db>"],
    requiresKey: "suggested.mcp.sqlite.requires",
  },
  {
    name: "Brave Search",
    descriptionKey: "suggested.mcp.brave-search.description",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "" },
    requiresKey: "suggested.mcp.brave-search.requires",
  },
  {
    name: "Slack",
    descriptionKey: "suggested.mcp.slack.description",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: { SLACK_BOT_TOKEN: "", SLACK_TEAM_ID: "" },
    requiresKey: "suggested.mcp.slack.requires",
  },
];

export const SUGGESTED_SKILLS: SuggestedSkill[] = [
  {
    name: "Conventional Commits",
    descriptionKey: "suggested.skill.conventional-commits.description",
    content: `When creating commits, use the Conventional Commits format:
- feat: new feature
- fix: bug fix
- refactor: code change that neither fixes a bug nor adds a feature
- docs: documentation only
- test: adding or correcting tests
- chore: maintenance tasks

The commit message must start in lowercase, use the imperative mood ("add", not "added"),
and explain the "why" when it is not obvious.`,
  },
  {
    name: "Code Review",
    descriptionKey: "suggested.skill.code-review.description",
    content: `Before approving a code review, check:
- Does the change solve the requested problem without touching unrelated code?
- Is there error handling for paths that can fail?
- Are variable and function names clear?
- Were tests added or updated for the new behavior?
- Is there duplicated code that could be extracted?
- Are there leftover console.log calls, TODOs, or debug comments?`,
  },
  {
    name: "Tests First",
    descriptionKey: "suggested.skill.tests-first.description",
    content: `When implementing a new feature or fixing a bug:
1. First write a failing test that demonstrates the expected behavior.
2. Implement the minimum code necessary to make the test pass.
3. Refactor while keeping tests green.
4. Run the entire test suite before considering the task finished, not just the new test.`,
  },
  {
    name: "Document Changes",
    descriptionKey: "suggested.skill.document-changes.description",
    content: `When a change affects how the project is used or configured:
- Update the README if a command, option, or setup step changes.
- If a CHANGELOG exists, add a brief entry describing the change.
- Do not document implementation details that might quickly become obsolete; document
  observable behavior.`,
  },
  {
    name: "Basic Security",
    descriptionKey: "suggested.skill.basic-security.description",
    content: `Before closing a task, verify:
- No credentials, tokens, or secret keys are left hardcoded in code or commits.
- User inputs are validated before being used in queries, shell commands, or file
  paths (prevent SQL injection, command injection, and path traversal).
- New dependencies come from a trusted source and do not duplicate existing packages.`,
  },
  {
    name: "Concise Responses",
    descriptionKey: "suggested.skill.concise-responses.description",
    content: `When answering or explaining a change, prioritize brevity:
- Explain the "what" and "why" in a few lines before showing code.
- Avoid repeating the entire plan or narrating every intermediate step.
- If the request is simple, the response should be simple as well.`,
  },
  {
    name: "Plan Before Implementing",
    descriptionKey: "suggested.skill.plan-before-implementing.description",
    content: `For tasks that touch more than one file or have ambiguity:
1. First explore relevant code to understand the current state.
2. Outline a short plan (which files change and why) before writing code.
3. If the request is ambiguous, make the most conservative decision and record it; do not ask if you can proceed autonomously.`,
  },
  {
    name: "Verify Before Finishing",
    descriptionKey: "suggested.skill.verify-before-finishing.description",
    content: `Before considering a task finished:
- Run the project's build/typecheck and fix any errors you introduced.
- Run the relevant test suite, not just the one you believed was affected.
- If the project has lint configured, also run lint on the touched files.
- Do not consider the task finished if any of these checks fail.`,
  },
  {
    name: "Strict TypeScript Style",
    descriptionKey: "suggested.skill.strict-typescript-style.description",
    content: `When writing TypeScript:
- Avoid "any"; use concrete or generic types.
- Do not leave unused variables or imports (noUnusedLocals).
- Prefer explicit interfaces/types in public contracts (props, exported function return types)
  and let the rest be inferred.
- Handle "null"/"undefined" explicitly instead of casting with "!" unless it is impossible to occur.`,
  },
  {
    name: "Basic UI Accessibility",
    descriptionKey: "suggested.skill.basic-ui-accessibility.description",
    content: `When building UI components:
- Every clickable element must be a <button>, an <a>, or have role="button" and be keyboard navigable.
- Inputs must have an associated <label> (or aria-label if no visible label is present).
- Icons that convey information (not purely decorative) must have alternative text or aria-label.
- Verify that text contrast against the background is legible, especially in disabled or "muted" states.`,
  },
];
