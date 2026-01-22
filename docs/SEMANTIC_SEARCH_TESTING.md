# Quick Testing Guide for Semantic Search

## 🧪 How to Test Semantic Search

### Before You Start
1. **Install Ollama**: Download from https://ollama.ai
2. **Pull embedding model**: `ollama pull nomic-embed-text`
3. **Enable CORS**: See SEMANTIC_SEARCH.md for OS-specific instructions
4. **Verify Ollama running**: `ollama list` in terminal

---

## Test 1: Enable Feature
1. Open SmrutiCortex popup
2. Click Settings (gear icon)
3. Scroll to "Semantic Search (AI Embeddings)"
4. ✅ Check "Enable semantic search"
5. Verify model is set to `nomic-embed-text`

---

## Test 2: Simple Semantic Query

**Search**: `machine learning`

**Expected Results**:
- Pages with "ML", "neural networks", "deep learning"
- Pages about AI, data science, model training
- Even if they don't contain exact text "machine learning"

**Check Console (F12)**:
```
🧠 Semantic search ACTIVE - generating query embedding
✅ Query embedding generated (768 dimensions)
🤖 SEMANTIC MATCH: similarity=0.85 | item="Neural Network Tutorial"
```

---

## Test 3: Synonym Understanding

**Search**: `cloud storage`

**Without Semantic Search**: Only "cloud storage" exact matches

**With Semantic Search**: 
- AWS S3 documentation
- Azure Blob Storage guides
- Google Cloud Storage tutorials
- Object storage articles
- File hosting services

---

## Test 4: Verify Embeddings Are Being Generated

Open browser console (F12) and run:

```javascript
// Check how many items have embeddings
chrome.storage.local.get(null, (data) => {
  const allItems = Object.values(data);
  const indexedItems = allItems.filter(item => item?.url);
  const withEmbeddings = indexedItems.filter(item => item.embedding);
  
  console.log(`📊 Embedding Stats:`);
  console.log(`   Total indexed items: ${indexedItems.length}`);
  console.log(`   Items with embeddings: ${withEmbeddings.length}`);
  console.log(`   Coverage: ${((withEmbeddings.length / indexedItems.length) * 100).toFixed(1)}%`);
});
```

---

## Test 5: Performance Check

1. **First search**: Note the time (should be 200-500ms for embedding generation)
2. **Same search again**: Should be much faster (~50ms, uses cached embedding)
3. **Console logs** will show timing:
   ```
   ✅ Query embedding generated in 234ms
   Search completed in 287ms, results: 15
   ```

---

## Test 6: Compare Keyword vs Semantic

**Query**: `git branching`

**Keyword Only** (disable semantic search):
- Pages with "git" AND "branching"
- Limited to exact matches

**Semantic + Keyword** (enable semantic search):
- Git branch strategies
- Merge workflows
- Feature branch patterns
- Gitflow articles
- Version control best practices

---

## Troubleshooting Tests

### Test: Is CORS Enabled?
```bash
curl http://localhost:11434/api/tags
```
Should return JSON. If error, CORS not enabled.

### Test: Can Extension Access Ollama?
Open console (F12) in popup and run:
```javascript
fetch('http://localhost:11434/api/tags')
  .then(r => r.json())
  .then(d => console.log('✅ CORS working:', d))
  .catch(e => console.error('❌ CORS blocked:', e));
```

### Test: Is Embedding Model Available?
```bash
ollama list | grep nomic
```
Should show `nomic-embed-text`.

---

## Expected Behavior

### ✅ Working Correctly
- Console shows embedding generation logs
- Semantic matches appear in results
- First search per page is slower (~200-500ms)
- Subsequent searches are fast (~50ms)
- Results include conceptually similar pages

### ❌ Not Working
- No embedding logs in console → Check if semantic search enabled
- "CORS blocked" error → Follow CORS setup in SEMANTIC_SEARCH.md
- No results → Check Ollama is running (`ollama list`)
- Very slow → Model not loaded yet (first search with new model takes 5-10s)

---

## Performance Expectations

### On-Demand Generation Strategy
- **No hour-long indexing wait** ✅
- Embeddings generated **during search**, not indexing
- **First search per page**: 200-500ms
- **Cached searches**: 50ms
- **3K items**: ~15-30 minutes total (if you search all items)
- **10K items**: ~1-2 hours total (if you search all items)

### Storage Growth
- **Per page**: ~4KB
- **1K pages**: ~4MB
- **10K pages**: ~40MB
- Check: Settings → Storage Quota

---

## Real-World Test Queries

Try these to see semantic search in action:

| Query | Expected Finds |
|-------|---------------|
| `python tutorials` | Python guides, coding courses, learn programming |
| `API documentation` | REST docs, API reference, developer guides |
| `error handling` | Exception handling, debugging, troubleshooting |
| `cloud deployment` | AWS, Azure, GCP deployment guides |
| `git workflow` | Version control, branching, CI/CD |
| `SQL queries` | Database, PostgreSQL, MySQL tutorials |

---

## Success Metrics

✅ **Semantic search is working if:**
1. Console shows embedding generation logs
2. Search finds conceptually related pages (not just keyword matches)
3. Performance is acceptable (< 500ms per search)
4. Results quality improves vs keyword-only search

---

**Need help?** See [SEMANTIC_SEARCH.md](SEMANTIC_SEARCH.md) for full documentation!
