# NPL-Dev for VS Code

A VS Code extension providing support for the Noumena Protocol Language (NPL), with language server integration.

## Overview

This extension serves as a client for the NPL language server, providing features such as:

- Syntax highlighting for `.npl` files
- Language server integration for code intelligence
- Error reporting and diagnostics

## Development Setup

### Prerequisites

- VS Code
- Node.js and npm

### Getting Started

1. Clone this repository
2. Run `npm install` to install dependencies
3. Press `F5` to open a new VS Code window with the extension loaded
4. Create or open a file with a `.npl` extension to see the extension in action

## Configuration

### Server Port

The extension  to an NPL language server on port 5007 before starting its own server. The TCP mode is currently primarily intended for development.

- **Development**: The default port is configured in `.vscode/launch.json`
- **Production**: Set the `NPL_SERVER_PORT` environment variable before launching VS Code

## Project Structure

- `src/extension.ts`: Main extension code that initializes the language client
- `server/language-server`: Binary executable for the NPL language server
- `syntaxes/`: Contains TextMate grammar for syntax highlighting
- `out/`: Compiled JavaScript output
- `src/test/`: Tests for the extension

## How It Works

The extension activates when a `.npl` file is opened and:

1. Starts the NPL Language Server as a child process
2. Establishes communication with the server using stdin/stdout pipes
3. Processes language features like diagnostics, code completion, etc.

## Commands

Available commands can be accessed by pressing `Cmd+Shift+P` and typing "NPL".

## Development Workflow

- Make changes to the extension code in `src/extension.ts`
- Press `Cmd+R` to reload the VS Code window with your changes
- Debug your extension by setting breakpoints in `src/extension.ts`
- View extension output in the Debug Console

## Testing

- Run `npm run watch` to start the TypeScript compiler in watch mode (needed to automatically compile code changes before testing)
- Run tests with `npm run test`
- Tests are located in `src/test/` with filenames matching the pattern `**.test.ts`

## Build and Package

- Run `npm run compile` or `npm run vscode:prepublish` to compile the extension
  - This generates JavaScript files in the `out/` directory (notably `out/extension.js`)
- Run `npm run package` to create a .vsix file for distribution

## TODO

- For improved performance and smaller package size:
  - Consider bundling the extension using webpack or esbuild
  - Follow the [bundling guide](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- Follow VS Code's [publishing guidelines](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) to publish to the marketplace
