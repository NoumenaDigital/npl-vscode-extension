# Change Log

<!-- All notable changes to the NPL-Dev for VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). -->

<!-- Uncomment if merging without releasing -->
<!-- ## [Unreleased] -->

## [1.4.0]

### Added

- Added support for NPL contrib libraries. You can now specify paths to NPL contrib library ZIP folders via the
  `NPL.contribLibraries` setting.

## [1.3.12]

### Added

- Added debouncing configuration for NPL server document change events via the `NPL.server.debouncing.time.ms` setting.

## [1.3.11]

### Fixed

- Fixed deployment error handling. If either the frontend or backend deployment fails, you should now see an appropriate
  final error message.

## [1.3.10]

### Added

- Extended the AI instructions with rules for generating frontends for NPL.

## [1.3.9]

### Fixed

- Fixed a bug that was forcing users to login to NOUMENA cloud again all the time.

## [1.3.8]

### Fixed

- Fixed a bug where the wrong NPL directory was being deployed to NOUMENA cloud.

## [1.3.7]

### Fixed

- When deploying static frontends, we now only attempt to detect if you have a "frontend/dist" folder, and don't care if
  you have a "frontend" folder as such.

## [1.3.6]

### Changed

- `noumena.cloud.authUrl` and `noumena.cloud.portalUrl` have been removed in favor of `noumena.cloud.domain`

### Added

- Support for deploying static frontends. The deploy button now asks you which kind of application you would like to
  deploy. If you deploy an NPL backend, it will also ask you if you want to create a typescript configuration file
  that's useful for integrating frontends.

## [1.3.5]

### Changed

- The `NPL.migrationDescriptor` must now specify a `migration.yml` file that lives in the _root_ of the directory to be
  deployed. It can no longer be placed in subdirectories.

### Added

- An activation event for `npl*` directories, such that the extension starts even if no `*.npl` files have been created
  in the project yet.

## [1.3.4]

Nothing!

## [1.3.3]

### Changed

- NPL syntax highlighting now works for NPL code blocks in Markdown files
- Made some minor improvements to the AI instructions file.

## [1.3.2]

### Changed

- NPL-dev now gets activated whenever a workspace contains NPL files, not just when you open them.

## [1.3.1]

### Fixed

- Fixed issues with the AI instruction file management

## [1.3.0]

### Added

- Added a Noumena Cloud view accessible from the activity bar. After logging into your Noumena Cloud account via your
  browser (using the device code flow), you can view your tenants and applications, deploy code, or clear their
  contents. The sources deployed are determined by the path specified in the `NPL.migrationDescriptor` setting, which we
  automatically populate if exactly one `**/migration.yml` file exists in the workspace.

## [1.2.0]

### Added

- NPL-dev will now ask you if you want to create, append to, or update specialized NPL AI instruction files for Cursor
  and GitHub Copilot.

## [1.1.0]

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

## [1.0.1]

### Added

- Publication to open-vsx (the extension marketplace used by Cursor, Windsurf, and others)
- This changelog

## [1.0.0]

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
