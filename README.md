# NPL-Dev for VS Code

A VS Code extension providing support for the Noumena Protocol Language (NPL), with language server integration.

## Overview

This extension provides support for the Noumena Protocol Language (NPL) in VS Code (and VS Code forks such as Cursor).

## Features

- Language Server support for NPL files
- Error and warning diagnostics from the NPL Language Server
- Syntax highlighting
- Code intelligence features

## Commands

Available commands can be accessed by opening the Command Palette (`Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on macOS) and typing "NPL":

- `NPL: Select Language Server Version` - Choose which version of the language server to use
- `NPL: Open Server Version Settings` - Open settings to configure the language server version
- `NPL: Clean Language Server Files and Reset` - Clean up language server files and reset to default state

## Configuration

The extension can be configured through VS Code settings:

- `NPL.server.version`: Version of the language server to use. Use 'latest' for the most recent version, or run the 'NPL: Select Language Server Version' command for a visual picker with auto-download.
