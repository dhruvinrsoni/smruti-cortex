# Semantic Search with AI Embeddings

## 🧠 What is Semantic Search?

**Semantic Search** finds pages by **meaning**, not just keywords. It uses AI to understand the *intent* behind your search.

### Examples

| Your Search | Keyword Search Finds | Semantic Search Finds |
|-------------|---------------------|----------------------|
| `ML tutorials` | Pages with "ML" or "tutorials" | Machine learning guides, neural network courses, AI programming lessons |
| `fix database` | Pages with "database fix" | SQL troubleshooting, data repair guides, database error handling |
| `cloud storage` | Exact text "cloud storage" | AWS S3, Azure Blob, Google Cloud Storage, object storage |
| `git workflow` | "git workflow" matches | Git branching, version control, CI/CD pipelines, merge strategies |

---

## 🆚 How is this Different from AI Keyword Expansion?

SmrutiCortex has **TWO separate AI features**:

### 1. **AI Keyword Expansion** (Existing)
- **What it does**: Expands your search terms with synonyms
- **Example**: "error" → ["error", "bug", "issue", "problem"]
- **Technology**: Uses Ollama LLM (llama3.2:1b) for text generation
- **Speed**: ONE API call per search (~200-500ms)
- **When**: During search time
- **Model**: Chat/generation models (llama3.2, gemma2, etc.)

### 2. **Semantic Search with Embeddings** (NEW)
- **What it does**: Understands the **meaning** of your search and pages
- **Example**: "ML tutorials" finds pages about "machine learning" even without those exact words
- **Technology**: Vector embeddings + cosine similarity matching
- **Speed**: ~100-300ms per search (after embeddings cached)
- **When**: Embeddings generated on-demand (first search), then cached
- **Model**: Embedding models (nomic-embed-text, all-minilm, etc.)

### Why Both?
- **Keyword Expansion**: Fast, lightweight, finds synonyms
- **Semantic Search**: Deep understanding, finds conceptually similar content
- **Together**: Maximum recall with high precision

---

## 🚀 Setup Guide

### Prerequisites
1. **Ollama installed** ([Download](https://ollama.ai))
2. **Embedding model pulled**:
   ```bash
   ollama pull nomic-embed-text
   ```
3. **CORS enabled** (see below)

### Enable Semantic Search
1. Open SmrutiCortex → **Settings** (gear icon)
2. Scroll to **"Semantic Search (AI Embeddings)"**
3. ✅ Check **"Enable semantic search"**
4. Select embedding model (default: `nomic-embed-text`)
5. Click outside to save

### First Search
- **First search per page**: Generates embedding (~200-500ms)
- **Subsequent searches**: Uses cached embeddings (~50ms)
- **Progress**: Check console logs (F12) to see embedding generation

---

## ⚙️ CORS Setup (REQUIRED)

Ollama blocks browser extensions by default. You **must** enable CORS.

### Windows

**Permanent Setup:**
```powershell
# 1. Open Environment Variables
Win + X → System → Advanced → Environment Variables

# 2. Add New System Variable:
Variable name: OLLAMA_ORIGINS
Variable value: *

# 3. Restart Ollama service
Stop-Service Ollama
Start-Service Ollama

# OR restart Ollama app from Start Menu
```

**Quick Test (Temporary):**
```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```

### macOS

**Permanent Setup:**
```bash
# 1. Edit launch config
nano ~/Library/LaunchAgents/com.ollama.plist

# 2. Add environment variable:
<key>EnvironmentVariables</key>
<dict>
    <key>OLLAMA_ORIGINS</key>
    <string>*</string>
</dict>

# 3. Restart Ollama
launchctl unload ~/Library/LaunchAgents/com.ollama.plist
launchctl load ~/Library/LaunchAgents/com.ollama.plist
```

**Quick Test (Temporary):**
```bash
export OLLAMA_ORIGINS="*"
ollama serve
```

### Linux

**Permanent Setup:**
```bash
# 1. Edit systemd service (if using systemd)
sudo systemctl edit ollama

# 2. Add:
[Service]
Environment="OLLAMA_ORIGINS=*"

# 3. Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart ollama

# OR for manual launch, add to ~/.bashrc or ~/.zshrc:
export OLLAMA_ORIGINS="*"
```

**Quick Test (Temporary):**
```bash
OLLAMA_ORIGINS="*" ollama serve
```

### Verify CORS is Working
```bash
# Test from terminal
curl http://localhost:11434/api/tags

# Should return JSON with model list
# If you get CORS errors in browser console (F12), CORS is NOT enabled
```

---

## 🧪 Testing & Verification

### Test 1: Enable and Search
1. **Enable semantic search** in Settings
2. **Search for**: `machine learning`
3. **Open Console** (F12)
4. **Look for logs**:
   ```
   🧠 Semantic search ACTIVE - generating query embedding
   ✅ Query embedding generated (768 dimensions)
   🤖 SEMANTIC MATCH: similarity=0.82 | item="Neural Network Tutorial"
   ```

### Test 2: Compare Results

**Without Semantic Search:**
- Search: `cloud storage`
- Results: Only pages with exact text "cloud storage"

**With Semantic Search:**
- Search: `cloud storage`
- Results: AWS S3, Azure Blob Storage, Google Cloud Storage, S3 alternatives, etc.

### Test 3: Synonym Understanding
- Search: `ML models`
- Should find: "machine learning", "neural networks", "deep learning", "AI training"

### Test 4: Check Embedding Generation
```javascript
// In browser console (F12)
chrome.storage.local.get(null, (data) => {
  const items = Object.values(data).filter(item => item.url);
  const withEmbeddings = items.filter(item => item.embedding);
  console.log(`${withEmbeddings.length} / ${items.length} items have embeddings`);
});
```

---

## 📊 Performance

### On-Demand Embedding Generation
- **Strategy**: Generate embeddings during search, not during indexing
- **Why**: Avoids 1-hour wait for 3K items
- **Trade-off**: First search per page is slower (~200-500ms)
- **Benefit**: Subsequent searches use cached embeddings (~50ms)

### Storage Impact
- **Per page**: ~4KB (768 dimensions × 4 bytes per float)
- **3,000 pages**: ~12MB additional storage
- **10,000 pages**: ~40MB additional storage

### Search Speed
- **First search (new page)**: 200-500ms (embedding generation)
- **Cached searches**: 50-100ms (vector similarity only)
- **Parallel processing**: Multiple items processed simultaneously

---

## 🔧 Troubleshooting

### "No results found" even with semantic search enabled
- **Check**: Is Ollama running? `ollama list` to verify
- **Check**: CORS enabled? See logs in console (F12)
- **Check**: Model downloaded? `ollama pull nomic-embed-text`

### "CORS BLOCKED" error in console
- **Fix**: Follow CORS setup above
- **Verify**: Restart Ollama after setting environment variable
- **Test**: `curl http://localhost:11434/api/tags` should work

### Slow search performance
- **First search per page**: Expected (200-500ms for embedding generation)
- **All searches slow**: Check Ollama performance, try smaller model
- **Model not loaded**: First search with new model takes 5-10s to load into memory

### Embeddings not being saved
- **Check**: Storage quota not exceeded? Settings → Storage Quota
- **Check**: Browser console for IndexedDB errors
- **Fix**: Clear & rebuild index if corrupted

---

## 🎯 Best Practices

### When to Use Semantic Search
✅ **Good for:**
- Finding pages by topic ("tutorials", "documentation", "guides")
- Discovering related content ("similar to X")
- Synonym matching ("car" finds "automobile", "vehicle")
- Concept-based search ("error handling" finds debugging guides)

❌ **Not good for:**
- Exact URL matching (use keyword search)
- File names or specific codes (keyword search is better)
- Very specific strings (keywords are faster)

### Recommended Settings
- **AI Keyword Expansion**: ON (fast, low overhead)
- **Semantic Search**: ON (deep understanding)
- **Embedding Model**: `nomic-embed-text` (best speed/quality balance)
- **Timeout**: 30000ms (30 seconds, allows model loading)

---

## 🔐 Privacy & Security

### Data Processing
- **100% Local**: All AI processing happens on your device
- **No Cloud**: Zero data sent to external servers
- **No Telemetry**: We don't track your searches or embeddings
- **Open Source**: Audit the code anytime

### Storage
- **IndexedDB**: Embeddings stored locally in browser storage
- **Encrypted at Rest**: Browser handles encryption (if enabled)
- **User Control**: Clear embeddings via "Clear All Data"

---

## 🛠️ Advanced Configuration

### Custom Embedding Models

Try different models for different use cases:

```
nomic-embed-text  → Fast, general-purpose (recommended)
all-minilm        → Alternative, good quality
mxbai-embed-large → High quality, slower, larger model
```

### Batch Embedding Generation (Future)

For users who want to pre-generate all embeddings:

```javascript
// In browser console (future feature)
chrome.runtime.sendMessage({
  type: 'GENERATE_ALL_EMBEDDINGS'
}, (response) => {
  console.log(`Generated embeddings for ${response.count} items`);
});
```

---

## 📚 Learn More

- [Ollama Documentation](https://ollama.ai/docs)
- [Vector Embeddings Explained](https://www.pinecone.io/learn/vector-embeddings/)
- [Cosine Similarity](https://en.wikipedia.org/wiki/Cosine_similarity)
- [SmrutiCortex GitHub](https://github.com/dhruvinrsoni/SmrutiCortex)

---

**Questions?** Open an issue on [GitHub](https://github.com/dhruvinrsoni/SmrutiCortex/issues)!
