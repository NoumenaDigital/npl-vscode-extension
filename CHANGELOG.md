# Change Log

All notable changes to the NPL-Dev for VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- NPL-dev will now ask you if you want to create, append to, or update specialized NPL AI instruction files for Cursor
  and GitHub Copilot.

## [1.1.0] - 2025-04-16

### Added

- NPL source/workspace selection. We've added settings and commands that allow you to specify where your production and
  test sources live, such that sources outside those folders are not analyzed by the language server.
  - Settings: `NPL.sources` and `NPL.testSources` (both apply to the current workspace only)
  - Commands: `NPL: Select NPL Sources` and `NPL: Select NPL Test Sources`
- This changelog

### Changed

- Moved developer-relevant parts of the README into DEVELOPING.md, such that the README is more suitable for the
  marketplace page

### Removed

- The `Publish` commit message trailer – publication occurs when the `version` in `package.json` is changed instead
- Folding support. This will be added back in a future release.
- The `NPL: Open Server Version Settings` command. This is already handled by the `NPL: Select Language Server Version`
  command, which is more user-friendly and provides a visual picker.

## [1.0.1] - 2025-03-25

### Added

- Publication to open-vsx (the extension marketplace used by Cursor, Windsurf, and others)
- This changelog

## [1.0.0] - 2025-03-25

### Added

- Language Server integration
- Diagnostics (errors and warnings) from the Language Server
- Dynamic version management and retrieval of platform-specific Language Server binaries
- "NPL: Select Language Server Version" command
- "NPL: Clean Language Server Files and Reset" command
- Syntax highlighting
- Support for comments
- Support for auto-closing and surrounding brackets and parentheses
- NPL filetype icons for light and dark mode
- README, license, contribution guidelines, and other important documents
- VS Code Marketplace publication – this is the first revision of the plugin to be published to the marketplace
