# Getting Started

Welcome to CodeLens! This guide will help you set up the project locally.

## Prerequisites

- **Node.js**: version 18 or higher (LTS recommended)
- **npm**: version 9 or higher
- **AI Provider credentials**: If you want to use the AI capabilities, you need an API key and project settings for your chosen LLM provider. CodeLens falls back gracefully to deterministic visualizations if these are omitted.

## Installation

1. Clone the repository (or extract the source):

   ```bash
   git clone <repository-url>
   cd CodeLens
   ```

2. Install all dependencies across the workspace:
   ```bash
   npm run install:all
   ```

## Configuration

CodeLens requires environment variables for AI services.

1. In the `server` directory, create a `.env` file:

   ```bash
   cd server
   touch .env
   ```

2. Add the following credentials to `.env`:
   ```env
   LLM_API_URL="https://api.your-provider.com"
   LLM_API_KEY="your-llm-api-key"
   LLM_PROJECT_ID="your-project-id"
   LLM_MODEL="meta-llama/llama-3-70b-instruct"
   ```

> [!WARNING]
> Never commit the `.env` file. It is explicitly ignored in `.gitignore`.

## Next Steps

- Proceed to [Development](development.md) to learn how to run the application.
- Proceed to [Testing](testing.md) to run the automated test suite.
