# Getting Started

Welcome to CodeLens! This guide will help you set up the project locally.

## Prerequisites

- **Node.js**: version 18 or higher (LTS recommended)
- **npm**: version 9 or higher
- **IBM watsonx credentials**: If you want to use the AI capabilities, you need an API key, project ID, and URL. CodeLens falls back gracefully to deterministic visualizations if these are omitted.

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
   WATSONX_URL="https://us-south.ml.cloud.ibm.com"
   WATSONX_API_KEY="your-ibm-cloud-api-key"
   WATSONX_PROJECT_ID="your-watsonx-project-id"
   WATSONX_MODEL="meta-llama/llama-3-70b-instruct"
   ```

> [!WARNING]
> Never commit the `.env` file. It is explicitly ignored in `.gitignore`.

## Next Steps

- Proceed to [Development](development.md) to learn how to run the application.
- Proceed to [Testing](testing.md) to run the automated test suite.
