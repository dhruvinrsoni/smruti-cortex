// ===== SmrutiCortex Interactive Demo =====
// Standalone, iframe-embeddable demo — all AI data pre-computed
// No Ollama required. Works on GitHub Pages.

(function () {
  'use strict';

  // ===== ENRICHED SAMPLE HISTORY =====
  // Each entry mirrors the real IndexedItem schema with pre-computed metadata

  const NOW = Date.now();
  const HOUR = 3600000;
  const DAY = 86400000;

  const SAMPLE_HISTORY = [
    { title: 'GitHub REST API Documentation', url: 'https://docs.github.com/en/rest', hostname: 'docs.github.com', metaDescription: 'Reference documentation for the GitHub REST API endpoints', visitCount: 87, lastVisit: NOW - 2 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'APIs'] },
    { title: 'GitHub - Pull Requests', url: 'https://github.com/pulls', hostname: 'github.com', metaDescription: 'View and manage your pull requests across repositories', visitCount: 142, lastVisit: NOW - 1 * HOUR, isBookmark: true, bookmarkFolders: ['Dev'] },
    { title: 'Stack Overflow - How to center a div', url: 'https://stackoverflow.com/questions/19461521', hostname: 'stackoverflow.com', metaDescription: 'CSS centering techniques including flexbox and grid solutions', visitCount: 23, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Stack Overflow - JavaScript async await', url: 'https://stackoverflow.com/questions/40400367', hostname: 'stackoverflow.com', metaDescription: 'Understanding async/await patterns and error handling in JavaScript', visitCount: 45, lastVisit: NOW - 1 * DAY, isBookmark: true, bookmarkFolders: ['Dev', 'JS'] },
    { title: 'MDN Web Docs - Array.prototype.map()', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map', hostname: 'developer.mozilla.org', metaDescription: 'The map method creates a new array from calling a function on every element', visitCount: 56, lastVisit: NOW - 5 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'Reference'] },
    { title: 'MDN Web Docs - CSS Flexbox', url: 'https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Flexbox', hostname: 'developer.mozilla.org', metaDescription: 'Flexbox layout model for arranging items in rows or columns', visitCount: 34, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'React Documentation - Getting Started', url: 'https://react.dev/learn', hostname: 'react.dev', metaDescription: 'Learn React step by step with interactive examples and tutorials', visitCount: 67, lastVisit: NOW - 6 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'React'] },
    { title: 'React Hooks - useState Tutorial', url: 'https://react.dev/reference/react/useState', hostname: 'react.dev', metaDescription: 'useState hook lets you add state to functional components', visitCount: 38, lastVisit: NOW - 12 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'TypeScript Handbook', url: 'https://www.typescriptlang.org/docs/handbook', hostname: 'typescriptlang.org', metaDescription: 'The TypeScript Handbook is a comprehensive guide to the language', visitCount: 52, lastVisit: NOW - 4 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'TS'] },
    { title: 'npm - Package Search', url: 'https://www.npmjs.com/search', hostname: 'npmjs.com', metaDescription: 'Search millions of JavaScript packages on the npm registry', visitCount: 29, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'VS Code - Keyboard Shortcuts', url: 'https://code.visualstudio.com/docs/getstarted/keybindings', hostname: 'code.visualstudio.com', metaDescription: 'Visual Studio Code keyboard shortcuts and keybinding customization', visitCount: 18, lastVisit: NOW - 7 * DAY, isBookmark: true, bookmarkFolders: ['Dev', 'Tools'] },
    { title: 'Amazon - Shopping Cart', url: 'https://www.amazon.com/gp/cart', hostname: 'amazon.com', metaDescription: 'View items in your Amazon shopping cart', visitCount: 95, lastVisit: NOW - 3 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Amazon Prime Video - Watch List', url: 'https://www.amazon.com/gp/video/watchlist', hostname: 'amazon.com', metaDescription: 'Your Prime Video watchlist of movies and TV shows', visitCount: 31, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'YouTube - Home', url: 'https://www.youtube.com', hostname: 'youtube.com', metaDescription: 'Watch videos, music, and live streams on YouTube', visitCount: 198, lastVisit: NOW - 30 * 60000, isBookmark: true, bookmarkFolders: ['Entertainment'] },
    { title: 'YouTube - How to learn programming', url: 'https://www.youtube.com/watch?v=programming101', hostname: 'youtube.com', metaDescription: 'Beginner programming tutorial covering fundamentals', visitCount: 12, lastVisit: NOW - 5 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Reddit - r/webdev', url: 'https://www.reddit.com/r/webdev', hostname: 'reddit.com', metaDescription: 'Community for web developers to share articles and discuss trends', visitCount: 76, lastVisit: NOW - 4 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'Communities'] },
    { title: 'Reddit - r/programming', url: 'https://www.reddit.com/r/programming', hostname: 'reddit.com', metaDescription: 'Discussion and news about programming languages and tools', visitCount: 64, lastVisit: NOW - 8 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Gmail - Inbox', url: 'https://mail.google.com/mail/u/0/#inbox', hostname: 'mail.google.com', metaDescription: 'Google email inbox for reading and composing messages', visitCount: 180, lastVisit: NOW - 45 * 60000, isBookmark: true, bookmarkFolders: ['Daily'] },
    { title: 'Google Docs - Untitled Document', url: 'https://docs.google.com/document/d/1abc', hostname: 'docs.google.com', metaDescription: 'Create and edit documents online with Google Docs', visitCount: 43, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Google Drive - My Drive', url: 'https://drive.google.com/drive/my-drive', hostname: 'drive.google.com', metaDescription: 'Cloud storage for files, photos, and documents', visitCount: 55, lastVisit: NOW - 6 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Notion - Project Dashboard', url: 'https://www.notion.so/workspace/project-dashboard', hostname: 'notion.so', metaDescription: 'All-in-one workspace for notes, tasks, and project management', visitCount: 89, lastVisit: NOW - 2 * HOUR, isBookmark: true, bookmarkFolders: ['Work'] },
    { title: 'Slack - General Channel', url: 'https://app.slack.com/client/T01/C01general', hostname: 'app.slack.com', metaDescription: 'Team messaging and collaboration platform', visitCount: 156, lastVisit: NOW - 1 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Jira - Sprint Board', url: 'https://mycompany.atlassian.net/jira/boards/1', hostname: 'mycompany.atlassian.net', metaDescription: 'Agile sprint board for tracking issues, tickets, and backlog items', visitCount: 134, lastVisit: NOW - 90 * 60000, isBookmark: true, bookmarkFolders: ['Work', 'Agile'] },
    { title: 'Wikipedia - History of the Internet', url: 'https://en.wikipedia.org/wiki/History_of_the_Internet', hostname: 'en.wikipedia.org', metaDescription: 'Overview of the development and evolution of the Internet', visitCount: 8, lastVisit: NOW - 14 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Wikipedia - Artificial Intelligence', url: 'https://en.wikipedia.org/wiki/Artificial_intelligence', hostname: 'en.wikipedia.org', metaDescription: 'Intelligence demonstrated by machines including learning and problem-solving', visitCount: 15, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'BBC News - Technology', url: 'https://www.bbc.com/news/technology', hostname: 'bbc.com', metaDescription: 'Latest technology news, analysis, and expert opinion', visitCount: 42, lastVisit: NOW - 10 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Hacker News - Top Stories', url: 'https://news.ycombinator.com', hostname: 'news.ycombinator.com', metaDescription: 'Social news for startups and technology community', visitCount: 110, lastVisit: NOW - 3 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'News'] },
    { title: 'Twitter / X - Home Timeline', url: 'https://x.com/home', hostname: 'x.com', metaDescription: 'Social media platform for posts, news, and conversations', visitCount: 167, lastVisit: NOW - 2 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'LinkedIn - My Network', url: 'https://www.linkedin.com/mynetwork', hostname: 'linkedin.com', metaDescription: 'Professional networking and career development platform', visitCount: 48, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Coursera - Machine Learning Course', url: 'https://www.coursera.org/learn/machine-learning', hostname: 'coursera.org', metaDescription: 'Stanford Machine Learning course by Andrew Ng covering supervised and unsupervised learning', visitCount: 22, lastVisit: NOW - 4 * DAY, isBookmark: true, bookmarkFolders: ['Learning', 'AI'] },
    { title: 'Udemy - Web Development Bootcamp', url: 'https://www.udemy.com/course/web-dev-bootcamp', hostname: 'udemy.com', metaDescription: 'Complete web development bootcamp with HTML, CSS, JavaScript and Node.js', visitCount: 16, lastVisit: NOW - 6 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Netflix - Continue Watching', url: 'https://www.netflix.com/browse', hostname: 'netflix.com', metaDescription: 'Stream movies and TV shows on Netflix', visitCount: 85, lastVisit: NOW - 5 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Spotify - Liked Songs', url: 'https://open.spotify.com/collection/tracks', hostname: 'open.spotify.com', metaDescription: 'Your favorite songs and music playlists on Spotify', visitCount: 72, lastVisit: NOW - 3 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'ChatGPT - New Chat', url: 'https://chatgpt.com', hostname: 'chatgpt.com', metaDescription: 'AI assistant for conversation, writing, and problem solving', visitCount: 120, lastVisit: NOW - 1 * HOUR, isBookmark: true, bookmarkFolders: ['AI'] },
    { title: 'Claude - Anthropic', url: 'https://claude.ai/new', hostname: 'claude.ai', metaDescription: 'Anthropic AI assistant for analysis, coding, and creative tasks', visitCount: 98, lastVisit: NOW - 30 * 60000, isBookmark: true, bookmarkFolders: ['AI'] },
    { title: 'Figma - Design File', url: 'https://www.figma.com/design/abc123', hostname: 'figma.com', metaDescription: 'Collaborative interface design tool for teams', visitCount: 35, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Canva - Create a Design', url: 'https://www.canva.com/design/create', hostname: 'canva.com', metaDescription: 'Online graphic design platform with templates and tools', visitCount: 19, lastVisit: NOW - 5 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'eBay - Electronics Deals', url: 'https://www.ebay.com/deals/electronics', hostname: 'ebay.com', metaDescription: 'Daily deals on electronics, computers, and gadgets', visitCount: 14, lastVisit: NOW - 8 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'PayPal - Activity', url: 'https://www.paypal.com/myaccount/transactions', hostname: 'paypal.com', metaDescription: 'View your payment history and transaction details', visitCount: 27, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Google Maps - Directions', url: 'https://www.google.com/maps/dir', hostname: 'google.com', metaDescription: 'Get driving, walking, and transit directions on Google Maps', visitCount: 63, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Uber Eats - Restaurants Near Me', url: 'https://www.ubereats.com/feed', hostname: 'ubereats.com', metaDescription: 'Order food delivery from local restaurants', visitCount: 41, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Chrome Web Store - Extensions', url: 'https://chromewebstore.google.com', hostname: 'chromewebstore.google.com', metaDescription: 'Browse and install Chrome browser extensions and themes', visitCount: 25, lastVisit: NOW - 4 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'W3Schools - HTML Tutorial', url: 'https://www.w3schools.com/html', hostname: 'w3schools.com', metaDescription: 'Learn HTML basics with interactive examples and exercises', visitCount: 30, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Vercel - Dashboard', url: 'https://vercel.com/dashboard', hostname: 'vercel.com', metaDescription: 'Deploy and manage frontend applications and serverless functions', visitCount: 44, lastVisit: NOW - 8 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'Deploy'] },
    { title: 'Docker Hub - Repositories', url: 'https://hub.docker.com/repositories', hostname: 'hub.docker.com', metaDescription: 'Container image registry for sharing and deploying Docker containers', visitCount: 21, lastVisit: NOW - 5 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Trello - My Boards', url: 'https://trello.com/myboards', hostname: 'trello.com', metaDescription: 'Visual project management with boards, lists, and cards', visitCount: 58, lastVisit: NOW - 12 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Medium - Technology Articles', url: 'https://medium.com/tag/technology', hostname: 'medium.com', metaDescription: 'Read and publish technology articles and engineering blogs', visitCount: 33, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Pinterest - Home Feed', url: 'https://www.pinterest.com', hostname: 'pinterest.com', metaDescription: 'Discover and save creative ideas, recipes, and inspiration', visitCount: 26, lastVisit: NOW - 4 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Twitch - Live Channels', url: 'https://www.twitch.tv/directory', hostname: 'twitch.tv', metaDescription: 'Watch live streams of gaming, music, and creative content', visitCount: 37, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Zoom - Join Meeting', url: 'https://zoom.us/join', hostname: 'zoom.us', metaDescription: 'Video conferencing and online meetings platform', visitCount: 73, lastVisit: NOW - 6 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Atlassian Confluence - Team Wiki', url: 'https://mycompany.atlassian.net/wiki', hostname: 'mycompany.atlassian.net', metaDescription: 'Team wiki for documentation, knowledge base, and project notes', visitCount: 68, lastVisit: NOW - 3 * HOUR, isBookmark: true, bookmarkFolders: ['Work'] },
  ];

  // ===== AI EXPANSION MAP =====
  // Pre-computed keyword expansions (simulates Ollama synonym generation)

  const AI_EXPANSION_MAP = {
    'jira':      ['sprint', 'board', 'ticket', 'issue', 'agile', 'backlog'],
    'sprint':    ['jira', 'agile', 'board', 'scrum', 'backlog', 'ticket'],
    'git':       ['repository', 'commit', 'branch', 'merge', 'pull', 'version'],
    'github':    ['repository', 'pull', 'commit', 'code', 'open-source'],
    'react':     ['component', 'hooks', 'jsx', 'frontend', 'virtual-dom', 'state'],
    'api':       ['endpoint', 'rest', 'request', 'response', 'documentation'],
    'css':       ['flexbox', 'grid', 'layout', 'style', 'responsive'],
    'javascript':['async', 'promise', 'function', 'es6', 'typescript'],
    'js':        ['javascript', 'async', 'node', 'typescript', 'es6'],
    'python':    ['django', 'flask', 'machine-learning', 'script', 'pip'],
    'docker':    ['container', 'image', 'deploy', 'kubernetes', 'devops'],
    'amazon':    ['shopping', 'cart', 'prime', 'deals', 'delivery'],
    'youtube':   ['video', 'stream', 'watch', 'channel', 'tutorial'],
    'learn':     ['tutorial', 'course', 'study', 'education', 'training'],
    'mail':      ['email', 'inbox', 'compose', 'message', 'gmail'],
    'design':    ['figma', 'ui', 'ux', 'prototype', 'creative'],
    'ai':        ['artificial-intelligence', 'machine-learning', 'neural', 'model', 'llm'],
    'deploy':    ['vercel', 'hosting', 'server', 'production', 'ci-cd'],
    'test':      ['unit', 'integration', 'vitest', 'jest', 'coverage'],
    'chat':      ['message', 'conversation', 'assistant', 'bot', 'ai'],
    'news':      ['article', 'headline', 'technology', 'trending', 'media'],
    'music':     ['spotify', 'playlist', 'song', 'stream', 'audio'],
    'code':      ['programming', 'developer', 'editor', 'vscode', 'syntax'],
  };

  // ===== SEMANTIC MATCHES =====
  // Pre-computed meaning-based matches (simulates embedding similarity)
  // Maps query string -> array of { url, similarity }

  const SEMANTIC_MATCHES = {
    'project management': [
      { url: 'https://mycompany.atlassian.net/jira/boards/1', similarity: 0.89 },
      { url: 'https://trello.com/myboards', similarity: 0.85 },
      { url: 'https://www.notion.so/workspace/project-dashboard', similarity: 0.82 },
      { url: 'https://mycompany.atlassian.net/wiki', similarity: 0.71 },
    ],
    'machine learning': [
      { url: 'https://www.coursera.org/learn/machine-learning', similarity: 0.93 },
      { url: 'https://en.wikipedia.org/wiki/Artificial_intelligence', similarity: 0.78 },
      { url: 'https://chatgpt.com', similarity: 0.65 },
      { url: 'https://claude.ai/new', similarity: 0.62 },
    ],
    'web development': [
      { url: 'https://www.udemy.com/course/web-dev-bootcamp', similarity: 0.91 },
      { url: 'https://react.dev/learn', similarity: 0.84 },
      { url: 'https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Flexbox', similarity: 0.77 },
      { url: 'https://www.w3schools.com/html', similarity: 0.75 },
      { url: 'https://www.reddit.com/r/webdev', similarity: 0.70 },
    ],
    'entertainment': [
      { url: 'https://www.netflix.com/browse', similarity: 0.88 },
      { url: 'https://www.youtube.com', similarity: 0.85 },
      { url: 'https://open.spotify.com/collection/tracks', similarity: 0.80 },
      { url: 'https://www.twitch.tv/directory', similarity: 0.76 },
    ],
    'team collaboration': [
      { url: 'https://app.slack.com/client/T01/C01general', similarity: 0.90 },
      { url: 'https://mycompany.atlassian.net/wiki', similarity: 0.83 },
      { url: 'https://zoom.us/join', similarity: 0.78 },
      { url: 'https://www.notion.so/workspace/project-dashboard', similarity: 0.75 },
    ],
  };


  // ===== MINI VIVEK SEARCH ENGINE =====

  // --- Graduated match classification ---
  function classifyMatch(text, token) {
    const lower = text.toLowerCase();
    const words = lower.split(/[\s\-_./]+/);
    for (const w of words) {
      if (w === token) return 1.0;       // EXACT
    }
    for (const w of words) {
      if (w.startsWith(token)) return 0.75; // PREFIX
    }
    if (lower.includes(token)) return 0.4;  // SUBSTRING
    return 0;                                // NONE
  }

  // --- Scorer 1: Title match (weight 0.35) ---
  function scoreTitle(item, tokens) {
    if (!tokens.length) return 0;
    let total = 0;
    for (const t of tokens) {
      total += classifyMatch(item.title, t);
    }
    return total / tokens.length;
  }

  // --- Scorer 2: URL match (weight 0.12) ---
  function scoreUrl(item, tokens) {
    if (!tokens.length) return 0;
    let total = 0;
    for (const t of tokens) {
      const urlScore = classifyMatch(item.url, t);
      const hostScore = classifyMatch(item.hostname, t);
      total += Math.max(urlScore, hostScore);
    }
    return total / tokens.length;
  }

  // --- Scorer 3: Recency (weight 0.20) ---
  function scoreRecency(item) {
    const daysSince = (NOW - item.lastVisit) / DAY;
    return Math.exp(-daysSince / 30); // exponential decay, half-life ~21 days
  }

  // --- Scorer 4: Visit count (weight 0.15) ---
  function scoreVisitCount(item) {
    return Math.min(1.0, Math.log(item.visitCount + 1) / Math.log(20));
  }

  // --- Scorer 5: Meta description match (weight 0.10) ---
  function scoreMeta(item, tokens) {
    if (!tokens.length || !item.metaDescription) return 0;
    let total = 0;
    for (const t of tokens) {
      total += classifyMatch(item.metaDescription, t);
    }
    return total / tokens.length;
  }

  // --- Weighted combination ---
  const SCORER_WEIGHTS = {
    title: 0.35,
    url: 0.12,
    recency: 0.20,
    visitCount: 0.15,
    meta: 0.10,
  };

  function computeScore(item, originalTokens, expandedTokens) {
    // Use expanded tokens for matching (includes originals)
    const tokens = expandedTokens.length > 0 ? expandedTokens : originalTokens;
    const titleScore = scoreTitle(item, tokens);
    const urlScore = scoreUrl(item, tokens);
    const recencyScore = scoreRecency(item);
    const visitScore = scoreVisitCount(item);
    const metaScore = scoreMeta(item, tokens);

    let score = titleScore * SCORER_WEIGHTS.title
              + urlScore * SCORER_WEIGHTS.url
              + recencyScore * SCORER_WEIGHTS.recency
              + visitScore * SCORER_WEIGHTS.visitCount
              + metaScore * SCORER_WEIGHTS.meta;

    // Post-score booster: literal substring in title (1.5x)
    for (const t of originalTokens) {
      if (item.title.toLowerCase().includes(t)) {
        score *= 1.5;
        break;
      }
    }

    // Bookmark boost (subtle)
    if (item.isBookmark) {
      score *= 1.08;
    }

    return score;
  }

  // --- Tokenizer ---
  function tokenize(query) {
    return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  }

  // --- Full search pipeline ---
  function search(query, aiEnabled, semanticEnabled) {
    const startTime = performance.now();
    const originalTokens = tokenize(query);
    if (originalTokens.length === 0) {
      // No query — show recent items sorted by recency
      const sorted = SAMPLE_HISTORY.slice()
        .sort((a, b) => b.lastVisit - a.lastVisit)
        .slice(0, 15);
      return {
        results: sorted.map(item => ({
          ...item,
          _score: 0,
          _matchType: 'none',
          _aiTokens: [],
          _originalTokens: [],
        })),
        aiExpanded: [],
        semanticCount: 0,
        searchTimeMs: Math.round(performance.now() - startTime),
      };
    }

    // Phase 1: expand tokens if AI enabled
    let expandedTokens = [...originalTokens];
    let aiExpanded = [];

    if (aiEnabled) {
      for (const token of originalTokens) {
        const expansions = AI_EXPANSION_MAP[token];
        if (expansions) {
          for (const exp of expansions) {
            if (!expandedTokens.includes(exp)) {
              expandedTokens.push(exp);
              aiExpanded.push(exp);
            }
          }
        }
      }
    }

    // Phase 2: score all items
    const scored = [];
    for (const item of SAMPLE_HISTORY) {
      const score = computeScore(item, originalTokens, expandedTokens);
      if (score > 0.05) { // threshold
        // Determine match type
        const matchesOriginal = originalTokens.some(t =>
          item.title.toLowerCase().includes(t) ||
          item.url.toLowerCase().includes(t) ||
          (item.metaDescription && item.metaDescription.toLowerCase().includes(t))
        );
        const matchesAI = aiExpanded.some(t =>
          item.title.toLowerCase().includes(t) ||
          item.url.toLowerCase().includes(t) ||
          (item.metaDescription && item.metaDescription.toLowerCase().includes(t))
        );

        let matchType = 'keyword';
        if (matchesOriginal && matchesAI) matchType = 'hybrid';
        else if (matchesAI && !matchesOriginal) matchType = 'ai-only';
        else if (matchesOriginal) matchType = 'keyword';
        else matchType = 'keyword'; // scored via recency/visit

        scored.push({
          ...item,
          _score: score,
          _matchType: matchType,
          _aiTokens: aiExpanded,
          _originalTokens: originalTokens,
        });
      }
    }

    // Phase 3: add semantic matches
    let semanticCount = 0;
    if (semanticEnabled) {
      const queryLower = query.toLowerCase().trim();
      for (const [semanticQuery, matches] of Object.entries(SEMANTIC_MATCHES)) {
        // Check if query is related to semantic query
        const semanticTokens = tokenize(semanticQuery);
        const overlap = originalTokens.some(t => semanticTokens.includes(t)) ||
                       semanticTokens.some(t => originalTokens.includes(t));
        // Also check substring match
        const substringMatch = queryLower.includes(semanticQuery) ||
                              semanticQuery.includes(queryLower);

        if (overlap || substringMatch) {
          for (const match of matches) {
            const existing = scored.find(r => r.url === match.url);
            if (existing) {
              // Boost existing result
              existing._score += match.similarity * 0.3;
              if (existing._matchType === 'keyword') existing._matchType = 'hybrid';
            } else {
              // Add new semantic result
              const item = SAMPLE_HISTORY.find(h => h.url === match.url);
              if (item) {
                scored.push({
                  ...item,
                  _score: match.similarity * 0.5,
                  _matchType: 'semantic',
                  _aiTokens: aiExpanded,
                  _originalTokens: originalTokens,
                });
                semanticCount++;
              }
            }
          }
        }
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b._score - a._score);

    return {
      results: scored.slice(0, 15),
      aiExpanded,
      semanticCount,
      searchTimeMs: Math.round(performance.now() - startTime),
    };
  }


  // ===== RENDERING =====

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Dual-color highlighting: yellow for original, green for AI-expanded
  function highlightText(text, originalTokens, aiTokens) {
    if (!originalTokens.length && !aiTokens.length) return escapeHtml(text);
    let result = escapeHtml(text);

    // First: highlight AI tokens (green) — do these first so originals take priority
    for (const token of aiTokens) {
      if (originalTokens.includes(token)) continue; // skip if also original
      const regex = new RegExp('(' + escapeRegex(escapeHtml(token)) + ')', 'gi');
      result = result.replace(regex, '<mark class="ai">$1</mark>');
    }

    // Second: highlight original tokens (yellow)
    for (const token of originalTokens) {
      const regex = new RegExp('(' + escapeRegex(escapeHtml(token)) + ')', 'gi');
      result = result.replace(regex, '<mark>$1</mark>');
    }

    return result;
  }

  // Recency label
  function recencyLabel(lastVisit) {
    const diff = NOW - lastVisit;
    if (diff < HOUR) return Math.round(diff / 60000) + 'm ago';
    if (diff < DAY) return Math.round(diff / HOUR) + 'h ago';
    const days = Math.round(diff / DAY);
    if (days === 1) return '1d ago';
    if (days < 30) return days + 'd ago';
    return Math.round(days / 30) + 'mo ago';
  }

  // First letter favicon
  function faviconLetter(hostname) {
    const parts = hostname.replace('www.', '').split('.');
    return (parts[0] || '?')[0].toUpperCase();
  }

  // Match type badge HTML
  function matchBadgeHtml(matchType) {
    if (matchType === 'none') return '';
    const labels = {
      'keyword': 'KW',
      'ai-only': 'AI',
      'hybrid': 'AI+KW',
      'semantic': 'SEM',
    };
    return '<span class="demo-match-badge ' + matchType + '">' + (labels[matchType] || '') + '</span>';
  }

  // Render a single result item (list view)
  function renderResultItem(r) {
    const div = document.createElement('div');
    div.className = 'demo-result';

    const originalTokens = r._originalTokens || [];
    const aiTokens = r._aiTokens || [];

    let bookmarkHtml = '';
    if (r.isBookmark) {
      bookmarkHtml = '<span class="demo-bookmark-star" title="Bookmarked">&#9733;</span>';
    }

    let folderHtml = '';
    if (r.isBookmark && r.bookmarkFolders && r.bookmarkFolders.length > 0) {
      folderHtml = '<div class="demo-bookmark-folder">&#128193; ' + escapeHtml(r.bookmarkFolders.join(' \u203A ')) + '</div>';
    }

    div.innerHTML =
      '<div class="demo-favicon">' + faviconLetter(r.hostname) + '</div>' +
      '<div class="demo-result-body">' +
        '<div class="demo-result-title-row">' +
          bookmarkHtml +
          '<span class="demo-result-title">' + highlightText(r.title, originalTokens, aiTokens) + '</span>' +
        '</div>' +
        '<div class="demo-result-url">' + highlightText(r.hostname, originalTokens, aiTokens) + '</div>' +
        folderHtml +
      '</div>' +
      '<div class="demo-result-meta">' +
        '<span class="demo-visit-badge">' + r.visitCount + ' visits</span>' +
        '<span class="demo-recency-label">' + recencyLabel(r.lastVisit) + '</span>' +
        matchBadgeHtml(r._matchType) +
      '</div>';

    return div;
  }

  // Render results into container
  function renderResults(container, results, viewMode) {
    container.innerHTML = '';
    container.className = 'demo-results' + (viewMode === 'cards' ? ' cards' : '');

    for (const r of results) {
      container.appendChild(renderResultItem(r));
    }
  }

  // Render AI status bar
  function renderAIBar(barEl, query, aiEnabled, semanticEnabled, aiExpanded, semanticCount, searchTimeMs) {
    barEl.innerHTML = '';

    if (!query.trim()) {
      barEl.classList.remove('visible');
      return;
    }

    barEl.classList.add('visible');

    // LEXICAL badge (always)
    const lexical = document.createElement('span');
    lexical.className = 'demo-badge demo-badge-lexical';
    lexical.textContent = 'LEXICAL';
    barEl.appendChild(lexical);

    // ENGRAM badge (AI expansion)
    if (aiEnabled && aiExpanded.length > 0) {
      const engram = document.createElement('span');
      engram.className = 'demo-badge demo-badge-engram';
      engram.textContent = 'ENGRAM +' + aiExpanded.length;
      engram.title = 'AI expanded keywords: ' + aiExpanded.join(', ');
      barEl.appendChild(engram);
    } else if (aiEnabled) {
      const neural = document.createElement('span');
      neural.className = 'demo-badge demo-badge-neural';
      neural.textContent = 'NEURAL';
      neural.title = 'AI search active (no expansions for this query)';
      barEl.appendChild(neural);
    }

    // Semantic badge
    if (semanticEnabled) {
      const sem = document.createElement('span');
      sem.className = 'demo-badge demo-badge-semantic';
      sem.textContent = semanticCount > 0
        ? '\uD83E\uDDE0 Semantic +' + semanticCount
        : '\uD83E\uDDE0 Semantic active';
      barEl.appendChild(sem);
    }

    // Timing
    const time = document.createElement('span');
    time.className = 'demo-ai-time';
    // Simulate realistic timing: add AI overhead when enabled
    let displayMs = searchTimeMs;
    if (aiEnabled) displayMs = Math.max(displayMs, 8) + Math.floor(Math.random() * 5);
    if (semanticEnabled) displayMs += Math.floor(Math.random() * 3);
    time.textContent = '~' + displayMs + 'ms';
    barEl.appendChild(time);
  }


  // ===== INIT =====

  // Detect embed mode
  const isEmbed = window.self !== window.top ||
                  new URLSearchParams(window.location.search).get('embed') === 'true';
  if (isEmbed) {
    document.body.classList.add('demo-embed');
  }

  // Theme
  const themeBtn = document.getElementById('demoThemeToggle');
  function getTheme() {
    return localStorage.getItem('demo-theme') ||
           (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('demo-theme', theme);
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  }
  applyTheme(getTheme());
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  // DOM refs
  const searchInput = document.getElementById('demoSearch');
  const resultsEl = document.getElementById('demoResults');
  const countEl = document.getElementById('demoCount');
  const aiBarEl = document.getElementById('demoAIBar');
  const aiToggle = document.getElementById('demoAIToggle');
  const semanticToggle = document.getElementById('demoSemanticToggle');
  const viewListBtn = document.getElementById('demoViewList');
  const viewCardsBtn = document.getElementById('demoViewCards');

  let viewMode = 'list';
  let activeIndex = -1;

  // Run search and update UI
  function update() {
    const query = searchInput.value;
    const aiEnabled = aiToggle.checked;
    const semanticEnabled = semanticToggle.checked;

    const { results, aiExpanded, semanticCount, searchTimeMs } = search(query, aiEnabled, semanticEnabled);

    renderResults(resultsEl, results, viewMode);
    renderAIBar(aiBarEl, query, aiEnabled, semanticEnabled, aiExpanded, semanticCount, searchTimeMs);

    if (query.trim()) {
      countEl.textContent = results.length + ' result' + (results.length !== 1 ? 's' : '');
    } else {
      countEl.textContent = '';
    }

    activeIndex = -1;
  }

  // Event listeners
  searchInput.addEventListener('input', update);
  aiToggle.addEventListener('change', update);
  semanticToggle.addEventListener('change', update);

  // View mode toggle
  function setViewMode(mode) {
    viewMode = mode;
    viewListBtn.classList.toggle('active', mode === 'list');
    viewCardsBtn.classList.toggle('active', mode === 'cards');
    update();
  }
  viewListBtn.addEventListener('click', () => setViewMode('list'));
  viewCardsBtn.addEventListener('click', () => setViewMode('cards'));

  // Keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    const items = resultsEl.querySelectorAll('.demo-result');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
      updateActiveItem(items);
    } else if (e.key === 'Escape') {
      searchInput.value = '';
      update();
    }
  });

  function updateActiveItem(items) {
    items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
    if (activeIndex >= 0 && items[activeIndex]) {
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // Initial render
  update();


  // ===== OVERLAY DEMO =====
  const overlayInput = document.getElementById('demoOverlayInput');
  const overlayResults = document.getElementById('demoOverlayResults');

  if (overlayInput && overlayResults) {
    function updateOverlay() {
      const query = overlayInput.value;
      const aiEnabled = aiToggle.checked;
      const { results } = search(query, aiEnabled, false);
      overlayResults.innerHTML = '';
      overlayResults.className = 'demo-overlay-results';
      for (const r of results.slice(0, 6)) {
        overlayResults.appendChild(renderResultItem(r));
      }
    }

    overlayInput.addEventListener('input', updateOverlay);
    overlayInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { overlayInput.value = ''; updateOverlay(); }
    });
    updateOverlay();
  }


  // ===== AUTO-TYPE DEMO =====
  // Types "jira" after 2s to showcase AI expansion
  let userInteracted = false;
  searchInput.addEventListener('focus', () => { userInteracted = true; });
  searchInput.addEventListener('input', function onFirstInput() {
    userInteracted = true;
    searchInput.removeEventListener('input', onFirstInput);
  });

  function autoType(input, text, callback) {
    let i = 0;
    const interval = setInterval(() => {
      if (userInteracted) { clearInterval(interval); return; }
      if (i <= text.length) {
        input.value = text.substring(0, i);
        callback();
        i++;
      } else {
        clearInterval(interval);
      }
    }, 130);
  }

  // Start auto-type after delay (unless embedded — skip in iframes for cleaner embed)
  if (!isEmbed) {
    setTimeout(() => {
      if (!userInteracted && searchInput.value === '') {
        autoType(searchInput, 'jira', update);
      }
    }, 2000);
  }

  // Console branding
  console.log('%c SmrutiCortex Demo ', 'background: #667eea; color: white; font-size: 16px; font-weight: bold; padding: 6px;');
  console.log('%c Interactive demo — all AI data pre-computed, no Ollama needed ', 'color: #64748b; font-size: 12px;');

})();
