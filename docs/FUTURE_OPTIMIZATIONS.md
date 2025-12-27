# Future Optimizations TODO

## 🔮 Offscreen Document for Heavy Computation

### What is an Offscreen Document?

An **Offscreen Document** is a hidden HTML page that Chrome MV3 extensions can create to run code that requires DOM APIs or Web Workers, which aren't available in service workers.

### Why Use It?

| Problem | Solution with Offscreen Document |
|---------|----------------------------------|
| Service workers can't use `document` | Offscreen has full DOM access |
| Service workers block on heavy computation | Offscreen can spawn Web Workers |
| Complex text processing (tokenization) | Run in parallel without blocking |
| Large dataset scoring | Non-blocking computation |

### Architecture

```
User types query
       │
       ▼
Content Script (quick-search.ts)
       │
       ▼ (port message)
Service Worker
       │
       ├──► IndexedDB: Fetch raw items (fast)
       │
       ▼ (message to offscreen)
Offscreen Document (offscreen.html)
       │
       ├──► Web Worker: Score & rank items (parallel, non-blocking)
       │
       ▼ (results back)
Service Worker
       │
       ▼ (port message)
Content Script renders results
```

### Implementation TODO

- [ ] Create `offscreen.html` with minimal HTML
- [ ] Create `offscreen.ts` to handle messages and spawn workers
- [ ] Create `scorer-worker.ts` as a Web Worker for parallel scoring
- [ ] Update service worker to delegate heavy computation
- [ ] Add `"offscreen"` permission to manifest

### When to Implement

Implement when:
- History items exceed 10,000 entries
- Search scoring takes >50ms
- Users report UI lag during search

### Chrome API Reference

```typescript
// Create offscreen document
await chrome.offscreen.createDocument({
  url: 'offscreen.html',
  reasons: [chrome.offscreen.Reason.WORKERS],
  justification: 'Parallel scoring using Web Workers'
});

// Check if exists
const existing = await chrome.offscreen.hasDocument();

// Close when done
await chrome.offscreen.closeDocument();
```

### Resources

- [Chrome Offscreen API Docs](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Web Workers in Extensions](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle#workers)

---

## 🚀 Other Future Optimizations

### 1. Virtual Scrolling for Results
- Only render visible results
- Use `content-visibility: auto` CSS
- Recycle DOM nodes

### 2. WebAssembly for Scoring
- Port scoring algorithms to Rust/WASM
- 10-100x faster than JavaScript for heavy computation

### 3. Persistent IndexedDB Connection
- Keep database connection warm
- Use connection pooling pattern

### 4. Compressed Storage
- Compress history metadata
- Reduce IndexedDB storage size
- Faster reads with less I/O
