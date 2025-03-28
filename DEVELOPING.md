# Developing

## Prerequisites

- VS Code
- Node.js and npm

## Getting Started

1. Clone this repository
2. Run `npm install` to install dependencies
3. Press `F5` to open a new VS Code window with the extension loaded
4. Create or open a file with a `.npl` extension to see the extension in action

## Project Structure

- `src/extension.ts`: Main extension code that initializes the language client
- `server/language-server`: Binary executable for the NPL language server
- `syntaxes/`: Contains TextMate grammar for syntax highlighting
- `out/`: Compiled JavaScript output
- `src/test/`: Tests for the extension

## Development Workflow

- Make changes to the extension code in `src/extension.ts`
- Press `Cmd+R` to reload the VS Code window with your changes
- Debug your extension by setting breakpoints in `src/extension.ts`
- View extension output in the Debug Console

## Testing

- Run `npm run watch` to start the TypeScript compiler in watch mode (needed to automatically compile code changes
  before testing)
- Run tests with `npm run test`
- Tests are located in `src/test/` with filenames matching the pattern `**.test.ts`

### E2E Tests and GitHub Rate Limiting

The extension's E2E tests communicate with the GitHub API to download the latest language server binary. Without
authentication, you may encounter rate limiting errors, especially in CI environments.

To avoid this, set a GitHub token in your environment:

```bash
export GITHUB_TOKEN=your_github_token
# or
export GH_TOKEN=your_github_token
```

If you encounter `Failed to fetch latest version information` errors in tests, this is likely due to GitHub API rate
limiting.

## Build and Package

- Run `npm run compile` or `npm run vscode:prepublish` to compile the extension
  - This generates JavaScript files in the `out/` directory (notably `out/extension.js`)
- Run `npm run package` to create a .vsix file for distribution

## Versioning and Publishing

When you want to publish a new version of the extension:

1. Update the `version` field in `package.json`
2. Create a PR with your changes
3. When merged to master, the CI will automatically detect the version change and publish the extension

## Server Configuration

The extension attempts to connect to an NPL language server on port 5007 before starting its own server. The TCP mode is
currently primarily intended for development.

- **Development**: The default port is configured in `.vscode/launch.json`
- **Production**: Set the `NPL_SERVER_PORT` environment variable before launching VS Code

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this
project.
