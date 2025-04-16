# Contributing to NPL-dev for VS Code

We welcome and appreciate contributions from the community! This document outlines the process for contributing to this
project.

## License

All contributions to this project must be made under the Apache License 2.0, as detailed in [LICENSE.md](LICENSE.md). By
submitting a pull request, you certify that you have the right to submit the code under this license and agree to the
terms.

## Contribution Requirements

### Pull Requests

All contributions should be submitted as pull requests. To ensure your PR is accepted, please:

1. **Follow Conventional Commits** - All commit messages and PR titles must follow the
   [Conventional Commits](https://www.conventionalcommits.org/) format
2. **Include Complete PR Description** - Replace the placeholder comment with a description of the diff.
3. **Include Test Coverage** - All new or modified functionality must include appropriate test coverage
4. **Pass All Tests** - Your changes must pass all the tests, see [DEVELOPING.md](DEVELOPING.md)
5. **Update the changelog** – If the diff added, changed, or removed user-facing features, add them to the
   [CHANGELOG.md](CHANGELOG.md). See also [Versioning and Publishing](DEVELOPING.md#versioning-and-publishing).

### PR Validation

Our repository uses automated workflows to validate pull requests. These workflows:

1. Validate that PR titles conform to conventional commits format
2. Check that PR descriptions are properly filled out
3. Run tests to prevent regression

**Important**: Workflows will only run after a CODEOWNER has approved the PR. This is a security measure to protect our
CI/CD infrastructure.

## Development Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests locally to ensure they pass
5. Create a pull request
6. Wait for review and approval from a CODEOWNER
7. Address any feedback
8. Once approved, your changes will be merged

Thank you for contributing to the NPL Language Server!
