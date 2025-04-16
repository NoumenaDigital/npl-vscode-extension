# NPL-Dev for VS Code

A VS Code extension providing support for the Noumena Protocol Language (NPL), with language server integration.

## Overview

This extension provides support for the Noumena Protocol Language (NPL) in VS Code (and VS Code forks such as Cursor).

Available for installation from the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=noumenadigital.npl-dev-vscode-extension), or
manually using the VSIX file (see [below](#installation-from-vsix)).

## Features

- **Syntax highlighting** Out-of-the-box support for `.npl` files with custom syntax highlighting.

- **Language Server support** Integrates seamlessly with the
  [NPL Language Server](https://github.com/NoumenaDigital/npl-language-server) for real-time feedback

### Error and Warning Diagnostics

<img src="img/error.png" alt="Error Example" width="50%" />
<img src="img/warning.png" alt="Warning Example" width="50%" />

Detailed diagnostics are provided via the NPL Language Server, including inline errors and warnings during development.
These are the same errors and warnings you would get when compiling your NPL code.

### Version Management

<img alt="Selecting the language server version" src="img.png" width="50%"/>

You can easily switch between different versions of the NPL Language Server to match your project's needs (e.g. using
deprecated syntax). The versions correspond to Noumena Platform releases.

### Workspace management

Run the NPL source management commands in order to restrict diagnostics to specific folders. By default, all NPL files
in your project are considered, so this is useful to avoid redefinition errors and improve performance.

## Commands

Available commands can be accessed by opening the Command Palette (`Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on
macOS) and typing "NPL".

## Configuration

The extension can be configured through the VS Code settings. To find NPL-specific settings, open the settings and
search for "NPL".

## Installation from VSIX

Some VS Code forks (like Cursor) have outdated extension marketplaces. In this case, you can install the extension
manually using the VSIX file by dragging it into your extensions view or running the "Install from VSIX" command.

The VSIX file can also be downloaded from our
[GitHub releases](https://github.com/NoumenaDigital/npl-vscode-extension/releases).
