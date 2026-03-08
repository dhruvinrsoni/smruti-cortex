## Summary
<!-- 1-3 bullet points: WHAT changed and WHY -->
-

## Type of Change
<!-- Check all that apply -->
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] Feature (non-breaking change that adds functionality)
- [ ] Refactor (no functional change, code improvement)
- [ ] Test (adding or updating tests, no source changes)
- [ ] Docs (documentation only)
- [ ] CI / Build (workflow, build config, dependencies)
- [ ] Breaking change (fix or feature that changes existing behavior)

## Area(s) Affected
<!-- Check all that apply -->
- [ ] Search engine / scorers
- [ ] AI / Ollama integration
- [ ] Popup UI
- [ ] Quick-search overlay
- [ ] Background service worker
- [ ] Settings / storage
- [ ] Build / CI / tooling

## Testing
<!-- How was this tested? -->
- [ ] `npm test` passes locally
- [ ] `npm run lint` passes locally
- [ ] `npm run build:prod` succeeds locally
- [ ] New/updated tests cover the changes
- [ ] Manual testing performed in Chrome

### Test Commands Run
```
npm test
npm run lint
npm run build:prod
```

## Coverage Impact
<!-- Check one -->
- [ ] No coverage-relevant changes
- [ ] Tests added for new code
- [ ] Tests added for previously untested code
- [ ] Coverage maintained or improved

## Screenshots
<!-- For UI changes, add before/after screenshots. Delete this section if not applicable. -->

## Checklist
- [ ] Code follows TypeScript conventions (no new JS files)
- [ ] No `console.log` added (use `Logger.forComponent()`)
- [ ] No unnecessary `any` casts introduced
- [ ] Self-review completed
- [ ] Checked for regressions in related features

## Related Issues
<!-- Link issues: Closes #123, Fixes #456, Related to #789 -->
