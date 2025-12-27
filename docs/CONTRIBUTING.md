# Contributing to SmrutiCortex

Thank you for your interest in contributing to SmrutiCortex! 🧠

This document provides guidelines for contributing to make the process smooth for everyone.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

- Be respectful and considerate
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Assume good intentions

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Chrome** or **Edge** (Chromium-based browser)
- **Git** for version control
- **VS Code** (recommended) with ESLint extension

### First-Time Setup

1. **Fork the repository** on GitHub

2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/SmrutiCortex.git
   cd SmrutiCortex
   ```

3. **Add upstream remote:**
   ```bash
   git remote add upstream https://github.com/dhruvinrsoni/SmrutiCortex.git
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Build and load:**
   ```bash
   npm run build
   ```
   Then load the `dist/` folder in `chrome://extensions`

---

## Development Setup

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Development build (readable, source maps) |
| `npm run build:prod` | Production build (minified) |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run clean` | Remove build artifacts |

### Project Structure

```
src/
├── background/       # Service worker, database, search engine
│   └── search/       # Modular scoring system
├── content_scripts/  # Page content extraction, inline overlay
├── core/             # Shared utilities, logger, settings
├── popup/            # Extension popup UI
└── shared/           # Shared abstractions (SOLID/DRY)
```

See [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md) for detailed architecture overview.

---

## How to Contribute

### Types of Contributions

- 🐛 **Bug fixes** - Fix issues from the issue tracker
- ✨ **Features** - Implement new functionality
- 📖 **Documentation** - Improve docs, add examples
- 🧪 **Tests** - Add or improve test coverage
- 🎨 **UI/UX** - Improve styling and user experience
- ⚡ **Performance** - Optimize search, indexing, or rendering

### Finding Issues

1. Check [open issues](https://github.com/dhruvinrsoni/SmrutiCortex/issues)
2. Look for `good first issue` labels for newcomers
3. Look for `help wanted` labels for priority items

### Creating Issues

Before creating an issue:
1. Search existing issues to avoid duplicates
2. For bugs: Include reproduction steps, expected vs actual behavior
3. For features: Explain the use case and proposed solution

---

## Pull Request Process

### Before You Start

1. **Check for existing work** - Make sure no one else is working on it
2. **Comment on the issue** - Let others know you're taking it
3. **Create a branch:**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

### Development Workflow

1. **Write your code** following our coding standards
2. **Add tests** for new functionality
3. **Update documentation** if needed
4. **Run checks locally:**
   ```bash
   npm run lint
   npm run test
   npm run build
   ```

### Submitting Your PR

1. **Commit with clear messages:**
   ```bash
   git commit -m "feat: add new scorer for domain matching"
   git commit -m "fix: resolve popup focus issue on startup"
   git commit -m "docs: update README with new keyboard shortcuts"
   ```

2. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Open a Pull Request** with:
   - Clear title describing the change
   - Description of what and why
   - Link to related issue(s)
   - Screenshots for UI changes

### PR Review

- Respond to feedback constructively
- Make requested changes in new commits
- Once approved, maintainers will merge

---

## Coding Standards

### TypeScript

- **Use TypeScript** for all new code
- **Strict mode** is enabled - fix all type errors
- **Avoid `any`** - use proper types or `unknown`
- **Export types** for public interfaces

### Code Style

```typescript
// ✅ Good
const searchResults = await performSearch(query);
if (searchResults.length === 0) {
  return [];
}

// ❌ Avoid
var results: any = performSearch(query)
if(results.length == 0) return []
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `search-engine.ts` |
| Classes | PascalCase | `SearchEngine` |
| Functions | camelCase | `performSearch()` |
| Constants | UPPER_SNAKE | `MAX_RESULTS` |
| Interfaces | PascalCase with I prefix (optional) | `SearchResult` |

### Architecture Patterns

- **SOLID principles** - Single responsibility, dependency injection
- **DRY** - Shared code goes in `/shared/`
- **Modular scorers** - New scoring algorithms go in `scorers/`

---

## Testing Guidelines

### Writing Tests

```typescript
// src/shared/__tests__/your-feature.test.ts
import { describe, it, expect } from 'vitest';
import { yourFunction } from '../your-module';

describe('yourFunction', () => {
  it('should handle normal input', () => {
    expect(yourFunction('input')).toBe('expected');
  });

  it('should handle edge cases', () => {
    expect(yourFunction('')).toBe('');
    expect(yourFunction(null)).toBeNull();
  });
});
```

### Test Commands

```bash
npm run test           # Run all tests once
npm run test:watch     # Watch mode during development
npm run test:coverage  # Generate coverage report
```

### What to Test

- ✅ Utility functions
- ✅ Scoring algorithms
- ✅ Data transformations
- ✅ Edge cases and error handling

---

## Documentation

### When to Update Docs

- Adding new features
- Changing public APIs
- Updating build or setup process
- Adding configuration options

### Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Project overview, installation |
| `docs/HOW_TO.md` | User guide |
| `docs/FAQ.md` | Common questions |
| `docs/TROUBLESHOOTING.md` | Debug guide |
| `docs/DEVELOPER_ONBOARDING.md` | Architecture for developers |
| `copilot-instructions.md` | AI assistant context |

---

## Commit Message Format

We use conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that doesn't fix or add |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build, CI, dependencies |

### Examples

```bash
feat(search): add fuzzy matching support
fix(popup): resolve keyboard navigation on first load
docs(readme): add installation instructions for Edge
perf(scoring): optimize recency calculation
test(scorers): add unit tests for title scorer
```

---

## Questions?

- 📖 Check the [documentation](./HOW_TO.md)
- 💬 Open a [Discussion](https://github.com/dhruvinrsoni/SmrutiCortex/discussions)
- 🐛 File an [Issue](https://github.com/dhruvinrsoni/SmrutiCortex/issues)

---

**Thank you for contributing to SmrutiCortex!** 🎉

*Every contribution, no matter how small, helps make SmrutiCortex better.*
