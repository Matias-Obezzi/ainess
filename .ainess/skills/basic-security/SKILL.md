# Basic Security

> Secrets, inputs, and dependencies

Before closing a task, verify:
- No credentials, tokens, or secret keys are left hardcoded in code or commits.
- User inputs are validated before being used in queries, shell commands, or file
  paths (prevent SQL injection, command injection, and path traversal).
- New dependencies come from a trusted source and do not duplicate existing packages.
