# Security Architecture

CodeLens is designed to securely analyze arbitrary, untrusted repositories uploaded by users.

## 1. ZIP Extraction Sandbox

Repositories are uploaded as ZIP archives to `POST /api/repository/upload`. 
The extraction process (`server/src/repositories/repositoryStore.js`) protects against **Path Traversal Attacks**:
- If any file path in the ZIP attempts to escape the root directory using `../` or absolute paths (`/etc/passwd`), the extraction is aborted immediately.
- Files are extracted into a secure, isolated sandbox located in `server/.data/<uuid>`.

## 2. File Size and Type Limits

- **File Limits**: `repositoryAnalyzer.js` limits analysis to files under 512KB. This prevents Denial of Service (DoS) attacks where a user uploads a massive minified bundle (e.g., a 20MB `bundle.js`) which would cause Tree-sitter or V8 to run out of memory.
- **Binary Rejection**: Non-text files (images, binaries) are automatically skipped.
- **Hidden Files**: The `.git` directory and `node_modules` are automatically ignored to prevent irrelevant analysis and save disk space.

## 3. Reference Validation

When IBM watsonx generates a response that references source files, the references are passed through a validation layer.
If the AI hallucinates a file path that does not exist in the deterministic repository file tree, the reference is securely stripped before being sent to the client.

## 4. Environment Secrets

API keys for IBM watsonx are strictly managed via the `server/.env` file. 
- The `.gitignore` at the project root explicitly ignores `.env`, preventing accidental commits of secrets.
- The backend never sends API keys to the frontend client. All LLM calls are proxied securely through the Express backend.
