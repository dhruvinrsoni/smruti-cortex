// ===== SmrutiCortex Interactive Demo =====
// Standalone, iframe-embeddable demo — all AI data pre-computed
// No Ollama required. Works on GitHub Pages.

(function () {
  'use strict';

  // ===== ENRICHED SAMPLE HISTORY =====

  const NOW = Date.now();
  const HOUR = 3600000;
  const DAY = 86400000;

  const SAMPLE_HISTORY = [
    // --- Developer Tools & Documentation ---
    { title: 'GitHub REST API Documentation', url: 'https://docs.github.com/en/rest', hostname: 'docs.github.com', metaDescription: 'Reference documentation for the GitHub REST API endpoints', visitCount: 87, lastVisit: NOW - 2 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'APIs'] },
    { title: 'GitHub - Pull Requests', url: 'https://github.com/pulls', hostname: 'github.com', metaDescription: 'View and manage your pull requests across repositories', visitCount: 142, lastVisit: NOW - 1 * HOUR, isBookmark: true, bookmarkFolders: ['Dev'] },
    { title: 'GitHub Actions - Workflows', url: 'https://github.com/features/actions', hostname: 'github.com', metaDescription: 'Automate CI/CD pipelines with GitHub Actions workflows', visitCount: 46, lastVisit: NOW - 5 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'CI/CD'] },
    { title: 'GitLab - Repository Dashboard', url: 'https://gitlab.com/dashboard/projects', hostname: 'gitlab.com', metaDescription: 'DevOps platform with Git repository management and CI/CD pipelines', visitCount: 33, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Bitbucket - Source Code Hosting', url: 'https://bitbucket.org/dashboard', hostname: 'bitbucket.org', metaDescription: 'Git code hosting with built-in CI/CD pipelines for agile teams', visitCount: 18, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Stack Overflow - How to center a div', url: 'https://stackoverflow.com/questions/19461521', hostname: 'stackoverflow.com', metaDescription: 'CSS centering techniques including flexbox and grid solutions', visitCount: 23, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Stack Overflow - JavaScript async await', url: 'https://stackoverflow.com/questions/40400367', hostname: 'stackoverflow.com', metaDescription: 'Understanding async/await patterns and error handling in JavaScript', visitCount: 45, lastVisit: NOW - 1 * DAY, isBookmark: true, bookmarkFolders: ['Dev', 'JS'] },
    { title: 'MDN Web Docs - Array.prototype.map()', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map', hostname: 'developer.mozilla.org', metaDescription: 'The map method creates a new array from calling a function on every element', visitCount: 56, lastVisit: NOW - 5 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'Reference'] },
    { title: 'MDN Web Docs - CSS Flexbox', url: 'https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Flexbox', hostname: 'developer.mozilla.org', metaDescription: 'Flexbox layout model for arranging items in rows or columns', visitCount: 34, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'React Documentation - Getting Started', url: 'https://react.dev/learn', hostname: 'react.dev', metaDescription: 'Learn React step by step with interactive examples and tutorials', visitCount: 67, lastVisit: NOW - 6 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'React'] },
    { title: 'React Hooks - useState Tutorial', url: 'https://react.dev/reference/react/useState', hostname: 'react.dev', metaDescription: 'useState hook lets you add state to functional components', visitCount: 38, lastVisit: NOW - 12 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'TypeScript Handbook', url: 'https://www.typescriptlang.org/docs/handbook', hostname: 'typescriptlang.org', metaDescription: 'The TypeScript Handbook is a comprehensive guide to the language', visitCount: 52, lastVisit: NOW - 4 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'TS'] },
    { title: 'npm - Package Search', url: 'https://www.npmjs.com/search', hostname: 'npmjs.com', metaDescription: 'Search millions of JavaScript packages on the npm registry', visitCount: 29, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'VS Code - Keyboard Shortcuts', url: 'https://code.visualstudio.com/docs/getstarted/keybindings', hostname: 'code.visualstudio.com', metaDescription: 'Visual Studio Code keyboard shortcuts and keybinding customization', visitCount: 18, lastVisit: NOW - 7 * DAY, isBookmark: true, bookmarkFolders: ['Dev', 'Tools'] },
    { title: 'W3Schools - HTML Tutorial', url: 'https://www.w3schools.com/html', hostname: 'w3schools.com', metaDescription: 'Learn HTML basics with interactive examples and exercises', visitCount: 30, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Dev.to - Developer Community', url: 'https://dev.to', hostname: 'dev.to', metaDescription: 'Community of developers sharing articles, tutorials, and discussions', visitCount: 47, lastVisit: NOW - 6 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Hashnode - Tech Blogging Platform', url: 'https://hashnode.com', hostname: 'hashnode.com', metaDescription: 'Start a developer blog and connect with the tech community', visitCount: 14, lastVisit: NOW - 4 * DAY, isBookmark: false, bookmarkFolders: [] },

    // --- Cloud & DevOps ---
    { title: 'AWS Management Console', url: 'https://console.aws.amazon.com', hostname: 'console.aws.amazon.com', metaDescription: 'Amazon Web Services cloud management console for EC2, S3, Lambda, and more', visitCount: 78, lastVisit: NOW - 3 * HOUR, isBookmark: true, bookmarkFolders: ['Cloud', 'AWS'] },
    { title: 'Google Cloud Console', url: 'https://console.cloud.google.com', hostname: 'console.cloud.google.com', metaDescription: 'Google Cloud Platform dashboard for Compute Engine, BigQuery, and GKE', visitCount: 42, lastVisit: NOW - 8 * HOUR, isBookmark: true, bookmarkFolders: ['Cloud', 'GCP'] },
    { title: 'Microsoft Azure Portal', url: 'https://portal.azure.com', hostname: 'portal.azure.com', metaDescription: 'Azure cloud services portal for virtual machines, databases, and AI', visitCount: 31, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'DigitalOcean - Droplets Dashboard', url: 'https://cloud.digitalocean.com/droplets', hostname: 'cloud.digitalocean.com', metaDescription: 'Manage cloud servers, databases, and Kubernetes clusters on DigitalOcean', visitCount: 22, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Vercel - Dashboard', url: 'https://vercel.com/dashboard', hostname: 'vercel.com', metaDescription: 'Deploy and manage frontend applications and serverless functions', visitCount: 44, lastVisit: NOW - 8 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'Deploy'] },
    { title: 'Docker Hub - Repositories', url: 'https://hub.docker.com/repositories', hostname: 'hub.docker.com', metaDescription: 'Container image registry for sharing and deploying Docker containers', visitCount: 21, lastVisit: NOW - 5 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Terraform Registry - Providers', url: 'https://registry.terraform.io', hostname: 'registry.terraform.io', metaDescription: 'Infrastructure as code providers and modules for cloud provisioning', visitCount: 15, lastVisit: NOW - 4 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Jenkins - Build Dashboard', url: 'https://jenkins.mycompany.com/dashboard', hostname: 'jenkins.mycompany.com', metaDescription: 'Continuous integration and delivery automation server', visitCount: 37, lastVisit: NOW - 10 * HOUR, isBookmark: false, bookmarkFolders: [] },

    // --- Databases ---
    { title: 'MongoDB Atlas - Clusters', url: 'https://cloud.mongodb.com/clusters', hostname: 'cloud.mongodb.com', metaDescription: 'Managed MongoDB database clusters in the cloud with auto-scaling', visitCount: 28, lastVisit: NOW - 1 * DAY, isBookmark: true, bookmarkFolders: ['Dev', 'Database'] },
    { title: 'Firebase Console - Projects', url: 'https://console.firebase.google.com', hostname: 'console.firebase.google.com', metaDescription: 'Google Firebase platform for app development with Firestore, Auth, and hosting', visitCount: 35, lastVisit: NOW - 12 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'PostgreSQL Documentation', url: 'https://www.postgresql.org/docs/current', hostname: 'postgresql.org', metaDescription: 'Official documentation for PostgreSQL relational database', visitCount: 19, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Redis Documentation', url: 'https://redis.io/docs', hostname: 'redis.io', metaDescription: 'In-memory data store used as cache, message broker, and database', visitCount: 16, lastVisit: NOW - 5 * DAY, isBookmark: false, bookmarkFolders: [] },

    // --- Analytics & Monitoring ---
    { title: 'Google Analytics - Dashboard', url: 'https://analytics.google.com/analytics', hostname: 'analytics.google.com', metaDescription: 'Web analytics service for tracking website traffic and user behavior', visitCount: 54, lastVisit: NOW - 4 * HOUR, isBookmark: true, bookmarkFolders: ['Work', 'Analytics'] },
    { title: 'Datadog - Infrastructure Monitoring', url: 'https://app.datadoghq.com/infrastructure', hostname: 'app.datadoghq.com', metaDescription: 'Cloud monitoring and observability platform for metrics, traces, and logs', visitCount: 38, lastVisit: NOW - 6 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Grafana - Dashboards', url: 'https://grafana.mycompany.com/dashboards', hostname: 'grafana.mycompany.com', metaDescription: 'Open source analytics and visualization platform for monitoring data', visitCount: 29, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },

    // --- Productivity & Collaboration ---
    { title: 'Gmail - Inbox', url: 'https://mail.google.com/mail/u/0/#inbox', hostname: 'mail.google.com', metaDescription: 'Google email inbox for reading and composing messages', visitCount: 180, lastVisit: NOW - 45 * 60000, isBookmark: true, bookmarkFolders: ['Daily'] },
    { title: 'Google Docs - Untitled Document', url: 'https://docs.google.com/document/d/1abc', hostname: 'docs.google.com', metaDescription: 'Create and edit documents online with Google Docs', visitCount: 43, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Google Drive - My Drive', url: 'https://drive.google.com/drive/my-drive', hostname: 'drive.google.com', metaDescription: 'Cloud storage for files, photos, and documents', visitCount: 55, lastVisit: NOW - 6 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Notion - Project Dashboard', url: 'https://www.notion.so/workspace/project-dashboard', hostname: 'notion.so', metaDescription: 'All-in-one workspace for notes, tasks, and project management', visitCount: 89, lastVisit: NOW - 2 * HOUR, isBookmark: true, bookmarkFolders: ['Work'] },
    { title: 'Slack - General Channel', url: 'https://app.slack.com/client/T01/C01general', hostname: 'app.slack.com', metaDescription: 'Team messaging and collaboration platform', visitCount: 156, lastVisit: NOW - 1 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Linear - Sprint Board', url: 'https://linear.app/acme/boards/1', hostname: 'linear.app', metaDescription: 'Agile sprint board for tracking issues, tickets, and backlog items', visitCount: 134, lastVisit: NOW - 90 * 60000, isBookmark: true, bookmarkFolders: ['Work', 'Agile'] },
    { title: 'Notion - Team Wiki', url: 'https://www.notion.so/acme/team-wiki', hostname: 'www.notion.so', metaDescription: 'Team wiki for documentation, knowledge base, and project notes', visitCount: 68, lastVisit: NOW - 3 * HOUR, isBookmark: true, bookmarkFolders: ['Work'] },
    { title: 'Trello - My Boards', url: 'https://trello.com/myboards', hostname: 'trello.com', metaDescription: 'Visual project management with boards, lists, and cards', visitCount: 58, lastVisit: NOW - 12 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Asana - My Tasks', url: 'https://app.asana.com/0/home', hostname: 'app.asana.com', metaDescription: 'Work management platform for teams to organize tasks and projects', visitCount: 42, lastVisit: NOW - 8 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Monday.com - Work OS', url: 'https://mycompany.monday.com', hostname: 'mycompany.monday.com', metaDescription: 'Team management and workflow automation platform', visitCount: 26, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Obsidian - Notes Vault', url: 'https://obsidian.md', hostname: 'obsidian.md', metaDescription: 'Knowledge base and note-taking with linked markdown files', visitCount: 61, lastVisit: NOW - 4 * HOUR, isBookmark: true, bookmarkFolders: ['Productivity'] },

    // --- Communication ---
    { title: 'Discord - Server Dashboard', url: 'https://discord.com/channels/@me', hostname: 'discord.com', metaDescription: 'Voice, video, and text communication platform for communities', visitCount: 94, lastVisit: NOW - 2 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Microsoft Teams - Chat', url: 'https://teams.microsoft.com', hostname: 'teams.microsoft.com', metaDescription: 'Business communication and collaboration with chat, meetings, and files', visitCount: 82, lastVisit: NOW - 3 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Google Meet - Video Call', url: 'https://meet.google.com', hostname: 'meet.google.com', metaDescription: 'Video conferencing and online meetings by Google', visitCount: 47, lastVisit: NOW - 8 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Telegram Web - Messages', url: 'https://web.telegram.org', hostname: 'web.telegram.org', metaDescription: 'Cloud-based instant messaging with end-to-end encryption', visitCount: 53, lastVisit: NOW - 5 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Zoom - Join Meeting', url: 'https://zoom.us/join', hostname: 'zoom.us', metaDescription: 'Video conferencing and online meetings platform', visitCount: 73, lastVisit: NOW - 6 * HOUR, isBookmark: false, bookmarkFolders: [] },

    // --- Social & News ---
    { title: 'Twitter / X - Home Timeline', url: 'https://x.com/home', hostname: 'x.com', metaDescription: 'Social media platform for posts, news, and conversations', visitCount: 167, lastVisit: NOW - 2 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'LinkedIn - My Network', url: 'https://www.linkedin.com/mynetwork', hostname: 'linkedin.com', metaDescription: 'Professional networking and career development platform', visitCount: 48, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Reddit - r/webdev', url: 'https://www.reddit.com/r/webdev', hostname: 'reddit.com', metaDescription: 'Community for web developers to share articles and discuss trends', visitCount: 76, lastVisit: NOW - 4 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'Communities'] },
    { title: 'Reddit - r/programming', url: 'https://www.reddit.com/r/programming', hostname: 'reddit.com', metaDescription: 'Discussion and news about programming languages and tools', visitCount: 64, lastVisit: NOW - 8 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Hacker News - Top Stories', url: 'https://news.ycombinator.com', hostname: 'news.ycombinator.com', metaDescription: 'Social news for startups and technology community', visitCount: 110, lastVisit: NOW - 3 * HOUR, isBookmark: true, bookmarkFolders: ['Dev', 'News'] },
    { title: 'TechCrunch - Startups & Tech', url: 'https://techcrunch.com', hostname: 'techcrunch.com', metaDescription: 'Breaking technology news and analysis on startups and venture capital', visitCount: 35, lastVisit: NOW - 10 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'The Verge - Tech News', url: 'https://www.theverge.com', hostname: 'theverge.com', metaDescription: 'Technology news, reviews, and analysis covering gadgets and culture', visitCount: 28, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'BBC News - Technology', url: 'https://www.bbc.com/news/technology', hostname: 'bbc.com', metaDescription: 'Latest technology news, analysis, and expert opinion', visitCount: 42, lastVisit: NOW - 10 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Medium - Technology Articles', url: 'https://medium.com/tag/technology', hostname: 'medium.com', metaDescription: 'Read and publish technology articles and engineering blogs', visitCount: 33, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Substack - Newsletter Dashboard', url: 'https://substack.com/home', hostname: 'substack.com', metaDescription: 'Subscribe to and publish newsletters on technology and culture', visitCount: 20, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Mastodon - Home Feed', url: 'https://mastodon.social/home', hostname: 'mastodon.social', metaDescription: 'Decentralized social media platform with open-source federation', visitCount: 15, lastVisit: NOW - 5 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'TikTok - For You Feed', url: 'https://www.tiktok.com/foryou', hostname: 'tiktok.com', metaDescription: 'Short-form video platform for entertainment, music, and trends', visitCount: 88, lastVisit: NOW - 4 * HOUR, isBookmark: false, bookmarkFolders: [] },

    // --- Knowledge & Education ---
    { title: 'Wikipedia - History of the Internet', url: 'https://en.wikipedia.org/wiki/History_of_the_Internet', hostname: 'en.wikipedia.org', metaDescription: 'Overview of the development and evolution of the Internet', visitCount: 8, lastVisit: NOW - 14 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Wikipedia - Artificial Intelligence', url: 'https://en.wikipedia.org/wiki/Artificial_intelligence', hostname: 'en.wikipedia.org', metaDescription: 'Intelligence demonstrated by machines including learning and problem-solving', visitCount: 15, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Coursera - Machine Learning Course', url: 'https://www.coursera.org/learn/machine-learning', hostname: 'coursera.org', metaDescription: 'Stanford Machine Learning course by Andrew Ng covering supervised and unsupervised learning', visitCount: 22, lastVisit: NOW - 4 * DAY, isBookmark: true, bookmarkFolders: ['Learning', 'AI'] },
    { title: 'Udemy - Web Development Bootcamp', url: 'https://www.udemy.com/course/web-dev-bootcamp', hostname: 'udemy.com', metaDescription: 'Complete web development bootcamp with HTML, CSS, JavaScript and Node.js', visitCount: 16, lastVisit: NOW - 6 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Khan Academy - Computing', url: 'https://www.khanacademy.org/computing', hostname: 'khanacademy.org', metaDescription: 'Free courses on computer science, algorithms, and programming', visitCount: 11, lastVisit: NOW - 8 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'freeCodeCamp - Learn to Code', url: 'https://www.freecodecamp.org/learn', hostname: 'freecodecamp.org', metaDescription: 'Free coding curriculum with certificates in web development and data science', visitCount: 24, lastVisit: NOW - 5 * DAY, isBookmark: true, bookmarkFolders: ['Learning'] },

    // --- AI Tools ---
    { title: 'ChatGPT - New Chat', url: 'https://chatgpt.com', hostname: 'chatgpt.com', metaDescription: 'AI assistant for conversation, writing, and problem solving', visitCount: 120, lastVisit: NOW - 1 * HOUR, isBookmark: true, bookmarkFolders: ['AI'] },
    { title: 'Claude - Anthropic', url: 'https://claude.ai/new', hostname: 'claude.ai', metaDescription: 'Anthropic AI assistant for analysis, coding, and creative tasks', visitCount: 98, lastVisit: NOW - 30 * 60000, isBookmark: true, bookmarkFolders: ['AI'] },

    // --- Entertainment ---
    { title: 'YouTube - Home', url: 'https://www.youtube.com', hostname: 'youtube.com', metaDescription: 'Watch videos, music, and live streams on YouTube', visitCount: 198, lastVisit: NOW - 30 * 60000, isBookmark: true, bookmarkFolders: ['Entertainment'] },
    { title: 'YouTube - How to learn programming', url: 'https://www.youtube.com/watch?v=programming101', hostname: 'youtube.com', metaDescription: 'Beginner programming tutorial covering fundamentals', visitCount: 12, lastVisit: NOW - 5 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Netflix - Continue Watching', url: 'https://www.netflix.com/browse', hostname: 'netflix.com', metaDescription: 'Stream movies and TV shows on Netflix', visitCount: 85, lastVisit: NOW - 5 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Spotify - Liked Songs', url: 'https://open.spotify.com/collection/tracks', hostname: 'open.spotify.com', metaDescription: 'Your favorite songs and music playlists on Spotify', visitCount: 72, lastVisit: NOW - 3 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Twitch - Live Channels', url: 'https://www.twitch.tv/directory', hostname: 'twitch.tv', metaDescription: 'Watch live streams of gaming, music, and creative content', visitCount: 37, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },

    // --- Shopping & E-Commerce ---
    { title: 'Amazon - Shopping Cart', url: 'https://www.amazon.com/gp/cart', hostname: 'amazon.com', metaDescription: 'View items in your Amazon shopping cart', visitCount: 95, lastVisit: NOW - 3 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'Amazon Prime Video - Watch List', url: 'https://www.amazon.com/gp/video/watchlist', hostname: 'amazon.com', metaDescription: 'Your Prime Video watchlist of movies and TV shows', visitCount: 31, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'eBay - Electronics Deals', url: 'https://www.ebay.com/deals/electronics', hostname: 'ebay.com', metaDescription: 'Daily deals on electronics, computers, and gadgets', visitCount: 14, lastVisit: NOW - 8 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Walmart - Online Shopping', url: 'https://www.walmart.com', hostname: 'walmart.com', metaDescription: 'Shop for groceries, electronics, and everyday essentials at low prices', visitCount: 32, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Etsy - Handmade & Vintage', url: 'https://www.etsy.com', hostname: 'etsy.com', metaDescription: 'Marketplace for unique handmade, vintage, and creative goods', visitCount: 17, lastVisit: NOW - 5 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Best Buy - Electronics', url: 'https://www.bestbuy.com', hostname: 'bestbuy.com', metaDescription: 'Consumer electronics, computers, appliances, and tech accessories', visitCount: 21, lastVisit: NOW - 4 * DAY, isBookmark: false, bookmarkFolders: [] },

    // --- Finance ---
    { title: 'Stripe Dashboard - Payments', url: 'https://dashboard.stripe.com', hostname: 'dashboard.stripe.com', metaDescription: 'Payment processing platform for internet businesses', visitCount: 43, lastVisit: NOW - 6 * HOUR, isBookmark: true, bookmarkFolders: ['Work', 'Finance'] },
    { title: 'PayPal - Activity', url: 'https://www.paypal.com/myaccount/transactions', hostname: 'paypal.com', metaDescription: 'View your payment history and transaction details', visitCount: 27, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Coinbase - Portfolio', url: 'https://www.coinbase.com/portfolio', hostname: 'coinbase.com', metaDescription: 'Cryptocurrency exchange for buying, selling, and trading Bitcoin and Ethereum', visitCount: 36, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Robinhood - Investing', url: 'https://robinhood.com/account', hostname: 'robinhood.com', metaDescription: 'Commission-free stock, ETF, and cryptocurrency trading platform', visitCount: 29, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Mint - Budget Tracker', url: 'https://mint.intuit.com/overview', hostname: 'mint.intuit.com', metaDescription: 'Personal finance app for budgeting, bills, and credit score tracking', visitCount: 19, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },

    // --- Travel ---
    { title: 'Airbnb - Explore Stays', url: 'https://www.airbnb.com', hostname: 'airbnb.com', metaDescription: 'Book unique homes, apartments, and experiences around the world', visitCount: 24, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Expedia - Hotel Bookings', url: 'https://www.expedia.com/Hotels', hostname: 'expedia.com', metaDescription: 'Search and book hotels, flights, and vacation packages', visitCount: 12, lastVisit: NOW - 7 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Google Flights - Search', url: 'https://www.google.com/travel/flights', hostname: 'google.com', metaDescription: 'Compare flight prices and find the best airfare deals', visitCount: 18, lastVisit: NOW - 5 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Booking.com - Hotels & Deals', url: 'https://www.booking.com', hostname: 'booking.com', metaDescription: 'Book accommodations, flights, and car rentals worldwide', visitCount: 15, lastVisit: NOW - 6 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Google Maps - Directions', url: 'https://www.google.com/maps/dir', hostname: 'google.com', metaDescription: 'Get driving, walking, and transit directions on Google Maps', visitCount: 63, lastVisit: NOW - 1 * DAY, isBookmark: false, bookmarkFolders: [] },

    // --- Health & Fitness ---
    { title: 'Strava - Activity Feed', url: 'https://www.strava.com/dashboard', hostname: 'strava.com', metaDescription: 'Track running, cycling, and workout activities with GPS', visitCount: 44, lastVisit: NOW - 8 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'MyFitnessPal - Food Diary', url: 'https://www.myfitnesspal.com/food/diary', hostname: 'myfitnesspal.com', metaDescription: 'Calorie counter and nutrition tracker for diet and fitness goals', visitCount: 51, lastVisit: NOW - 6 * HOUR, isBookmark: false, bookmarkFolders: [] },
    { title: 'WebMD - Health Information', url: 'https://www.webmd.com', hostname: 'webmd.com', metaDescription: 'Medical information, symptoms checker, and health news', visitCount: 9, lastVisit: NOW - 10 * DAY, isBookmark: false, bookmarkFolders: [] },

    // --- Design ---
    { title: 'Figma - Design File', url: 'https://www.figma.com/design/abc123', hostname: 'figma.com', metaDescription: 'Collaborative interface design tool for teams', visitCount: 35, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Canva - Create a Design', url: 'https://www.canva.com/design/create', hostname: 'canva.com', metaDescription: 'Online graphic design platform with templates and tools', visitCount: 19, lastVisit: NOW - 5 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Dribbble - Design Inspiration', url: 'https://dribbble.com', hostname: 'dribbble.com', metaDescription: 'Discover creative design work from top designers and agencies', visitCount: 22, lastVisit: NOW - 3 * DAY, isBookmark: false, bookmarkFolders: [] },

    // --- Other ---
    { title: 'Chrome Web Store - Extensions', url: 'https://chromewebstore.google.com', hostname: 'chromewebstore.google.com', metaDescription: 'Browse and install Chrome browser extensions and themes', visitCount: 25, lastVisit: NOW - 4 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Uber Eats - Restaurants Near Me', url: 'https://www.ubereats.com/feed', hostname: 'ubereats.com', metaDescription: 'Order food delivery from local restaurants', visitCount: 41, lastVisit: NOW - 2 * DAY, isBookmark: false, bookmarkFolders: [] },
    { title: 'Pinterest - Home Feed', url: 'https://www.pinterest.com', hostname: 'pinterest.com', metaDescription: 'Discover and save creative ideas, recipes, and inspiration', visitCount: 26, lastVisit: NOW - 4 * DAY, isBookmark: false, bookmarkFolders: [] },
  ];

  // ===== AI EXPANSION MAP =====

  const AI_EXPANSION_MAP = {
    'linear':     ['sprint', 'board', 'ticket', 'issue', 'agile', 'backlog'],
    'sprint':     ['linear', 'agile', 'board', 'scrum', 'backlog', 'ticket'],
    'git':        ['repository', 'commit', 'branch', 'merge', 'pull', 'version'],
    'github':     ['repository', 'pull', 'commit', 'code', 'open-source'],
    'react':      ['component', 'hooks', 'jsx', 'frontend', 'virtual-dom', 'state'],
    'api':        ['endpoint', 'rest', 'request', 'response', 'documentation'],
    'css':        ['flexbox', 'grid', 'layout', 'style', 'responsive'],
    'javascript': ['async', 'promise', 'function', 'es6', 'typescript'],
    'js':         ['javascript', 'async', 'node', 'typescript', 'es6'],
    'python':     ['django', 'flask', 'machine-learning', 'script', 'pip'],
    'docker':     ['container', 'image', 'deploy', 'kubernetes', 'devops'],
    'amazon':     ['shopping', 'cart', 'prime', 'deals', 'delivery'],
    'youtube':    ['video', 'stream', 'watch', 'channel', 'tutorial'],
    'learn':      ['tutorial', 'course', 'study', 'education', 'training'],
    'mail':       ['email', 'inbox', 'compose', 'message', 'gmail'],
    'design':     ['figma', 'ui', 'ux', 'prototype', 'creative'],
    'ai':         ['artificial-intelligence', 'machine-learning', 'neural', 'model', 'llm'],
    'deploy':     ['vercel', 'hosting', 'server', 'production', 'ci/cd'],
    'test':       ['unit', 'integration', 'vitest', 'jest', 'coverage'],
    'chat':       ['message', 'conversation', 'assistant', 'bot', 'ai'],
    'news':       ['article', 'headline', 'technology', 'trending', 'media'],
    'music':      ['spotify', 'playlist', 'song', 'stream', 'audio'],
    'code':       ['programming', 'developer', 'editor', 'vscode', 'syntax'],
    'cloud':      ['aws', 'gcp', 'azure', 'hosting', 'infrastructure'],
    'database':   ['mongodb', 'firebase', 'postgresql', 'sql', 'nosql'],
    'devops':     ['ci/cd', 'jenkins', 'terraform', 'kubernetes', 'pipeline'],
    'crypto':     ['bitcoin', 'blockchain', 'trading', 'wallet', 'defi'],
    'travel':     ['flights', 'booking', 'hotel', 'airbnb', 'vacation'],
    'fitness':    ['workout', 'health', 'strava', 'exercise', 'training'],
    'meeting':    ['zoom', 'teams', 'video', 'conference', 'call'],
    'shopping':   ['cart', 'deals', 'order', 'delivery', 'price'],
    'blog':       ['article', 'post', 'writing', 'medium', 'newsletter'],
    'monitor':    ['analytics', 'metrics', 'dashboard', 'grafana', 'logs'],
    'social':     ['feed', 'post', 'followers', 'timeline', 'trending'],
  };

  // ===== SEMANTIC MATCHES =====

  const SEMANTIC_MATCHES = {
    'project management': [
      { url: 'https://linear.app/acme/boards/1', similarity: 0.89 },
      { url: 'https://trello.com/myboards', similarity: 0.85 },
      { url: 'https://www.notion.so/workspace/project-dashboard', similarity: 0.82 },
      { url: 'https://mycompany.atlassian.net/wiki', similarity: 0.71 },
      { url: 'https://app.asana.com/0/home', similarity: 0.68 },
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
      { url: 'https://www.freecodecamp.org/learn', similarity: 0.66 },
    ],
    'entertainment': [
      { url: 'https://www.netflix.com/browse', similarity: 0.88 },
      { url: 'https://www.youtube.com', similarity: 0.85 },
      { url: 'https://open.spotify.com/collection/tracks', similarity: 0.80 },
      { url: 'https://www.twitch.tv/directory', similarity: 0.76 },
      { url: 'https://www.tiktok.com/foryou', similarity: 0.72 },
    ],
    'team collaboration': [
      { url: 'https://app.slack.com/client/T01/C01general', similarity: 0.90 },
      { url: 'https://mycompany.atlassian.net/wiki', similarity: 0.83 },
      { url: 'https://zoom.us/join', similarity: 0.78 },
      { url: 'https://www.notion.so/workspace/project-dashboard', similarity: 0.75 },
      { url: 'https://teams.microsoft.com', similarity: 0.73 },
      { url: 'https://discord.com/channels/@me', similarity: 0.65 },
    ],
    'cloud infrastructure': [
      { url: 'https://console.aws.amazon.com', similarity: 0.92 },
      { url: 'https://console.cloud.google.com', similarity: 0.88 },
      { url: 'https://portal.azure.com', similarity: 0.85 },
      { url: 'https://cloud.digitalocean.com/droplets', similarity: 0.78 },
      { url: 'https://registry.terraform.io', similarity: 0.65 },
    ],
    'video conferencing': [
      { url: 'https://zoom.us/join', similarity: 0.91 },
      { url: 'https://teams.microsoft.com', similarity: 0.87 },
      { url: 'https://discord.com/channels/@me', similarity: 0.74 },
      { url: 'https://meet.google.com', similarity: 0.82 },
    ],
    'financial tracking': [
      { url: 'https://dashboard.stripe.com', similarity: 0.86 },
      { url: 'https://robinhood.com/account', similarity: 0.81 },
      { url: 'https://www.coinbase.com/portfolio', similarity: 0.78 },
      { url: 'https://mint.intuit.com/overview', similarity: 0.85 },
    ],
    'content creation': [
      { url: 'https://dev.to', similarity: 0.84 },
      { url: 'https://substack.com/home', similarity: 0.81 },
      { url: 'https://medium.com/tag/technology', similarity: 0.79 },
      { url: 'https://hashnode.com', similarity: 0.76 },
    ],
  };


  // ===== SMART SUGGESTION CHIPS =====

  const SUGGESTIONS = {
    keyword: {
      label: 'Try:',
      items: [
        { query: 'github', hint: 'Pull requests & API docs' },
        { query: 'react', hint: 'Hooks & component docs' },
        { query: 'amazon', hint: 'Shopping & Prime Video' },
        { query: 'youtube', hint: 'Videos & tutorials' },
        { query: 'google', hint: 'Gmail, Cloud, Meet, Analytics' },
      ],
    },
    ai: {
      label: 'Try AI:',
      items: [
        { query: 'linear', hint: 'AI: sprint, board, ticket' },
        { query: 'database', hint: 'AI: mongodb, firebase, sql' },
        { query: 'meeting', hint: 'AI: zoom, teams, conference' },
        { query: 'cloud', hint: 'AI: aws, gcp, azure' },
        { query: 'design', hint: 'AI: figma, ui, ux' },
      ],
    },
    semantic: {
      label: 'Try semantic:',
      items: [
        { query: 'project management', hint: 'Finds Linear, Trello, Notion' },
        { query: 'machine learning', hint: 'Finds Coursera, AI tools' },
        { query: 'web development', hint: 'Finds React, CSS, tutorials' },
        { query: 'team collaboration', hint: 'Finds Slack, Zoom, Teams' },
        { query: 'cloud infrastructure', hint: 'Finds AWS, GCP, Azure' },
      ],
    },
  };


  // ===== MINI VIVEK SEARCH ENGINE =====

  function classifyMatch(text, token) {
    var lower = text.toLowerCase();
    var words = lower.split(/[\s\-_./]+/);
    for (var j = 0; j < words.length; j++) {
      if (words[j] === token) return 1.0;
    }
    for (var j = 0; j < words.length; j++) {
      if (words[j].startsWith(token)) return 0.75;
    }
    if (lower.includes(token)) return 0.4;
    return 0;
  }

  function scoreTitle(item, tokens) {
    if (!tokens.length) return 0;
    var total = 0;
    for (var i = 0; i < tokens.length; i++) total += classifyMatch(item.title, tokens[i]);
    return total / tokens.length;
  }

  function scoreUrl(item, tokens) {
    if (!tokens.length) return 0;
    var total = 0;
    for (var i = 0; i < tokens.length; i++) {
      total += Math.max(classifyMatch(item.url, tokens[i]), classifyMatch(item.hostname, tokens[i]));
    }
    return total / tokens.length;
  }

  function scoreRecency(item) {
    return Math.exp(-(NOW - item.lastVisit) / DAY / 30);
  }

  function scoreVisitCount(item) {
    return Math.min(1.0, Math.log(item.visitCount + 1) / Math.log(20));
  }

  function scoreMeta(item, tokens) {
    if (!tokens.length || !item.metaDescription) return 0;
    var total = 0;
    for (var i = 0; i < tokens.length; i++) total += classifyMatch(item.metaDescription, tokens[i]);
    return total / tokens.length;
  }

  var WEIGHTS = { title: 0.35, url: 0.12, recency: 0.20, visitCount: 0.15, meta: 0.10 };

  function computeScore(item, originalTokens, expandedTokens) {
    var tokens = expandedTokens.length > 0 ? expandedTokens : originalTokens;
    var score = scoreTitle(item, tokens) * WEIGHTS.title
              + scoreUrl(item, tokens) * WEIGHTS.url
              + scoreRecency(item) * WEIGHTS.recency
              + scoreVisitCount(item) * WEIGHTS.visitCount
              + scoreMeta(item, tokens) * WEIGHTS.meta;
    for (var i = 0; i < originalTokens.length; i++) {
      if (item.title.toLowerCase().includes(originalTokens[i])) { score *= 1.5; break; }
    }
    if (item.isBookmark) score *= 1.08;
    return score;
  }

  function tokenize(query) {
    return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  }

  function search(query, aiEnabled, semanticEnabled) {
    var startTime = performance.now();
    var originalTokens = tokenize(query);
    if (originalTokens.length === 0) {
      var sorted = SAMPLE_HISTORY.slice().sort(function(a, b) { return b.lastVisit - a.lastVisit; }).slice(0, 15);
      return {
        results: sorted.map(function(item) {
          return Object.assign({}, item, { _score: 0, _matchType: 'none', _aiTokens: [], _originalTokens: [] });
        }),
        aiExpanded: [], semanticCount: 0, searchTimeMs: Math.round(performance.now() - startTime),
      };
    }

    var expandedTokens = originalTokens.slice();
    var aiExpanded = [];
    if (aiEnabled) {
      for (var i = 0; i < originalTokens.length; i++) {
        var expansions = AI_EXPANSION_MAP[originalTokens[i]];
        if (expansions) {
          for (var j = 0; j < expansions.length; j++) {
            if (expandedTokens.indexOf(expansions[j]) === -1) {
              expandedTokens.push(expansions[j]);
              aiExpanded.push(expansions[j]);
            }
          }
        }
      }
    }

    var scored = [];
    for (var i = 0; i < SAMPLE_HISTORY.length; i++) {
      var item = SAMPLE_HISTORY[i];
      var sc = computeScore(item, originalTokens, expandedTokens);
      if (sc > 0.05) {
        var matchesOrig = originalTokens.some(function(t) {
          return item.title.toLowerCase().includes(t) || item.url.toLowerCase().includes(t) ||
                 (item.metaDescription && item.metaDescription.toLowerCase().includes(t));
        });
        var matchesAI = aiExpanded.some(function(t) {
          return item.title.toLowerCase().includes(t) || item.url.toLowerCase().includes(t) ||
                 (item.metaDescription && item.metaDescription.toLowerCase().includes(t));
        });
        var mt = 'keyword';
        if (matchesOrig && matchesAI) mt = 'hybrid';
        else if (matchesAI && !matchesOrig) mt = 'ai-only';
        scored.push(Object.assign({}, item, { _score: sc, _matchType: mt, _aiTokens: aiExpanded, _originalTokens: originalTokens }));
      }
    }

    var semanticCount = 0;
    if (semanticEnabled) {
      var queryLower = query.toLowerCase().trim();
      var entries = Object.entries(SEMANTIC_MATCHES);
      for (var i = 0; i < entries.length; i++) {
        var semQuery = entries[i][0], matches = entries[i][1];
        var semTokens = tokenize(semQuery);
        var overlap = originalTokens.some(function(t) { return semTokens.indexOf(t) !== -1; }) ||
                     semTokens.some(function(t) { return originalTokens.indexOf(t) !== -1; });
        var subMatch = queryLower.includes(semQuery) || semQuery.includes(queryLower);
        if (overlap || subMatch) {
          for (var j = 0; j < matches.length; j++) {
            var existing = scored.find(function(r) { return r.url === matches[j].url; });
            if (existing) {
              existing._score += matches[j].similarity * 0.3;
              if (existing._matchType === 'keyword') existing._matchType = 'hybrid';
              semanticCount++;
            } else {
              var found = SAMPLE_HISTORY.find(function(h) { return h.url === matches[j].url; });
              if (found) {
                scored.push(Object.assign({}, found, {
                  _score: matches[j].similarity * 0.5, _matchType: 'semantic',
                  _aiTokens: aiExpanded, _originalTokens: originalTokens,
                }));
                semanticCount++;
              }
            }
          }
        }
      }
    }

    scored.sort(function(a, b) { return b._score - a._score; });
    return { results: scored.slice(0, 15), aiExpanded: aiExpanded, semanticCount: semanticCount, searchTimeMs: Math.round(performance.now() - startTime) };
  }


  // ===== RENDERING =====

  function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function highlightText(text, originalTokens, aiTokens) {
    if (!originalTokens.length && !aiTokens.length) return escapeHtml(text);
    var result = escapeHtml(text);
    for (var i = 0; i < aiTokens.length; i++) {
      if (originalTokens.indexOf(aiTokens[i]) !== -1) continue;
      result = result.replace(new RegExp('(' + escapeRegex(escapeHtml(aiTokens[i])) + ')', 'gi'), '<mark class="ai">$1</mark>');
    }
    for (var i = 0; i < originalTokens.length; i++) {
      result = result.replace(new RegExp('(' + escapeRegex(escapeHtml(originalTokens[i])) + ')', 'gi'), '<mark>$1</mark>');
    }
    return result;
  }

  function recencyLabel(lastVisit) {
    var diff = NOW - lastVisit;
    if (diff < HOUR) return Math.round(diff / 60000) + 'm ago';
    if (diff < DAY) return Math.round(diff / HOUR) + 'h ago';
    var days = Math.round(diff / DAY);
    if (days === 1) return '1d ago';
    if (days < 30) return days + 'd ago';
    return Math.round(days / 30) + 'mo ago';
  }

  function faviconLetter(hostname) {
    return (hostname.replace('www.', '').split('.')[0] || '?')[0].toUpperCase();
  }

  function matchBadgeHtml(mt) {
    if (mt === 'none') return '';
    var labels = { 'keyword':'KW', 'ai-only':'AI', 'hybrid':'AI+KW', 'semantic':'SEM' };
    return '<span class="demo-match-badge ' + mt + '">' + (labels[mt] || '') + '</span>';
  }

  function renderResultItem(r) {
    var div = document.createElement('div');
    div.className = 'demo-result';
    var ot = r._originalTokens || [], at = r._aiTokens || [];
    var bk = r.isBookmark ? '<span class="demo-bookmark-star" title="Bookmarked">&#9733;</span>' : '';
    var fl = (r.isBookmark && r.bookmarkFolders && r.bookmarkFolders.length) ?
      '<div class="demo-bookmark-folder">&#128193; ' + escapeHtml(r.bookmarkFolders.join(' \u203A ')) + '</div>' : '';
    div.innerHTML =
      '<div class="demo-favicon">' + faviconLetter(r.hostname) + '</div>' +
      '<div class="demo-result-body">' +
        '<div class="demo-result-title-row">' + bk +
          '<span class="demo-result-title">' + highlightText(r.title, ot, at) + '</span></div>' +
        '<div class="demo-result-url">' + highlightText(r.hostname, ot, at) + '</div>' + fl +
      '</div>' +
      '<div class="demo-result-meta">' +
        '<span class="demo-visit-badge">' + r.visitCount + ' visits</span>' +
        '<span class="demo-recency-label">' + recencyLabel(r.lastVisit) + '</span>' +
        matchBadgeHtml(r._matchType) + '</div>';
    return div;
  }

  function renderResults(container, results, viewMode) {
    container.innerHTML = '';
    container.className = 'demo-results' + (viewMode === 'cards' ? ' cards' : '');
    for (var i = 0; i < results.length; i++) container.appendChild(renderResultItem(results[i]));
  }

  function renderAIBar(barEl, query, aiEnabled, semanticEnabled, aiExpanded, semanticCount, searchTimeMs) {
    barEl.innerHTML = '';
    if (!query.trim()) { barEl.classList.remove('visible'); return; }
    barEl.classList.add('visible');

    var lex = document.createElement('span');
    lex.className = 'demo-badge demo-badge-lexical'; lex.textContent = 'LEXICAL';
    barEl.appendChild(lex);

    if (aiEnabled && aiExpanded.length > 0) {
      var eng = document.createElement('span');
      eng.className = 'demo-badge demo-badge-engram';
      eng.textContent = 'ENGRAM +' + aiExpanded.length;
      eng.title = 'AI expanded: ' + aiExpanded.join(', ');
      barEl.appendChild(eng);
    } else if (aiEnabled) {
      var neu = document.createElement('span');
      neu.className = 'demo-badge demo-badge-neural'; neu.textContent = 'NEURAL';
      barEl.appendChild(neu);
    }

    if (semanticEnabled) {
      var sem = document.createElement('span');
      sem.className = 'demo-badge demo-badge-semantic';
      sem.textContent = semanticCount > 0 ? '\uD83E\uDDE0 Semantic +' + semanticCount : '\uD83E\uDDE0 Semantic active';
      barEl.appendChild(sem);
    }

    var time = document.createElement('span');
    time.className = 'demo-ai-time';
    var ms = searchTimeMs;
    if (aiEnabled) ms = Math.max(ms, 8) + Math.floor(Math.random() * 5);
    if (semanticEnabled) ms += Math.floor(Math.random() * 3);
    time.textContent = '~' + ms + 'ms';
    barEl.appendChild(time);
  }


  // ===== INIT =====

  var isEmbed = window.self !== window.top ||
    new URLSearchParams(window.location.search).get('embed') === 'true';
  if (isEmbed) document.body.classList.add('demo-embed');

  // Theme
  var themeBtn = document.getElementById('demoThemeToggle');
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
  if (themeBtn) themeBtn.addEventListener('click', function() { applyTheme(getTheme() === 'dark' ? 'light' : 'dark'); });

  // DOM refs
  var aiToggle = document.getElementById('demoAIToggle');
  var semanticToggle = document.getElementById('demoSemanticToggle');
  var viewListBtn = document.getElementById('demoViewList');
  var viewCardsBtn = document.getElementById('demoViewCards');

  // Popup view refs
  var popupView = document.getElementById('demoPopupView');
  var popupSearch = document.getElementById('demoSearch');
  var popupResults = document.getElementById('demoResults');
  var popupCount = document.getElementById('demoCount');
  var popupAIBar = document.getElementById('demoAIBar');
  var popupSuggestions = document.getElementById('demoSuggestions');

  // Quick-search overlay view refs
  var overlayView = document.getElementById('demoOverlayView');
  var overlaySearch = document.getElementById('demoOverlayInput');
  var overlayResults = document.getElementById('demoOverlayResults');
  var overlaySuggestions = document.getElementById('demoOverlaySuggestions');

  // Tab buttons
  var tabPopup = document.getElementById('demoTabPopup');
  var tabOverlay = document.getElementById('demoTabOverlay');

  var viewMode = 'list';
  var activeTab = 'popup';
  var activeIndex = -1;

  // --- Tab switching ---
  function switchTab(tab) {
    activeTab = tab;
    tabPopup.classList.toggle('active', tab === 'popup');
    tabOverlay.classList.toggle('active', tab === 'overlay');
    popupView.classList.toggle('hidden', tab !== 'popup');
    overlayView.classList.toggle('hidden', tab !== 'overlay');
    // Sync search text between tabs
    if (tab === 'popup') {
      popupSearch.value = overlaySearch.value;
      updatePopup();
      popupSearch.focus();
    } else {
      overlaySearch.value = popupSearch.value;
      updateOverlay();
      overlaySearch.focus();
    }
  }
  tabPopup.addEventListener('click', function() { switchTab('popup'); });
  tabOverlay.addEventListener('click', function() { switchTab('overlay'); });

  // --- View mode ---
  function setViewMode(mode) {
    viewMode = mode;
    viewListBtn.classList.toggle('active', mode === 'list');
    viewCardsBtn.classList.toggle('active', mode === 'cards');
    updatePopup();
  }
  viewListBtn.addEventListener('click', function() { setViewMode('list'); });
  viewCardsBtn.addEventListener('click', function() { setViewMode('cards'); });

  // --- Suggestion rendering ---
  function getSuggestionSet() {
    if (aiToggle.checked && semanticToggle.checked) return SUGGESTIONS.semantic;
    if (aiToggle.checked) return SUGGESTIONS.ai;
    return SUGGESTIONS.keyword;
  }

  function renderSuggestions(container, onSelect) {
    container.innerHTML = '';
    var hasQuery = (activeTab === 'popup' ? popupSearch.value : overlaySearch.value).trim();
    if (hasQuery) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');

    var set = getSuggestionSet();
    var label = document.createElement('span');
    label.className = 'demo-suggestion-label';
    label.textContent = set.label;
    container.appendChild(label);

    for (var i = 0; i < set.items.length; i++) {
      (function(item) {
        var chip = document.createElement('button');
        chip.className = 'demo-suggestion-chip';
        chip.innerHTML = '<strong>' + escapeHtml(item.query) + '</strong> <span class="demo-suggestion-hint">' + escapeHtml(item.hint) + '</span>';
        chip.addEventListener('click', function() { onSelect(item.query); });
        container.appendChild(chip);
      })(set.items[i]);
    }

    var note = document.createElement('span');
    note.className = 'demo-suggestion-note';
    note.textContent = '(demo guide)';
    container.appendChild(note);
  }

  // --- Popup view update ---
  function updatePopup() {
    var query = popupSearch.value;
    var res = search(query, aiToggle.checked, semanticToggle.checked);
    renderResults(popupResults, res.results, viewMode);
    renderAIBar(popupAIBar, query, aiToggle.checked, semanticToggle.checked, res.aiExpanded, res.semanticCount, res.searchTimeMs);
    popupCount.textContent = query.trim() ? res.results.length + ' result' + (res.results.length !== 1 ? 's' : '') : '';
    activeIndex = -1;
    renderSuggestions(popupSuggestions, function(q) {
      popupSearch.value = q;
      userInteracted = true;
      updatePopup();
    });
  }

  // --- Overlay view update ---
  function updateOverlay() {
    var query = overlaySearch.value;
    var res = search(query, aiToggle.checked, false); // overlay doesn't show semantic in real ext
    overlayResults.innerHTML = '';
    overlayResults.className = 'demo-overlay-results';
    var items = res.results.slice(0, 6);
    for (var i = 0; i < items.length; i++) overlayResults.appendChild(renderResultItem(items[i]));
    renderSuggestions(overlaySuggestions, function(q) {
      overlaySearch.value = q;
      userInteracted = true;
      updateOverlay();
    });
  }

  // --- Event listeners ---
  popupSearch.addEventListener('input', updatePopup);
  overlaySearch.addEventListener('input', updateOverlay);
  aiToggle.addEventListener('change', function() { if (activeTab === 'popup') updatePopup(); else updateOverlay(); });
  semanticToggle.addEventListener('change', function() { if (activeTab === 'popup') updatePopup(); else updateOverlay(); });

  // Keyboard navigation (popup)
  popupSearch.addEventListener('keydown', function(e) {
    var items = popupResults.querySelectorAll('.demo-result');
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, items.length - 1); updateActiveItem(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, -1); updateActiveItem(items); }
    else if (e.key === 'Escape') { popupSearch.value = ''; updatePopup(); }
  });
  overlaySearch.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { overlaySearch.value = ''; updateOverlay(); }
  });

  function updateActiveItem(items) {
    items.forEach(function(it, i) { it.classList.toggle('active', i === activeIndex); });
    if (activeIndex >= 0 && items[activeIndex]) items[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  // Initial render
  updatePopup();
  updateOverlay();

  // Horizontal wheel scroll for suggestion chips
  [popupSuggestions, overlaySuggestions].forEach(function(el) {
    el.addEventListener('wheel', function(e) {
      if (el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  });


  // ===== AUTO-TYPE DEMO =====
  var userInteracted = false;
  popupSearch.addEventListener('focus', function() { userInteracted = true; });
  popupSearch.addEventListener('input', function onFirst() { userInteracted = true; popupSearch.removeEventListener('input', onFirst); });

  function autoType(input, text, callback) {
    var i = 0;
    var interval = setInterval(function() {
      if (userInteracted) { clearInterval(interval); return; }
      if (i <= text.length) { input.value = text.substring(0, i); callback(); i++; }
      else clearInterval(interval);
    }, 130);
  }

  if (!isEmbed) {
    setTimeout(function() {
      if (!userInteracted && popupSearch.value === '') {
        var set = getSuggestionSet();
        autoType(popupSearch, set.items[0].query, updatePopup);
      }
    }, 2000);
  }

  // Console branding
  console.log('%c SmrutiCortex Demo ', 'background: #667eea; color: white; font-size: 16px; font-weight: bold; padding: 6px;');
  console.log('%c ' + SAMPLE_HISTORY.length + ' entries | ' + Object.keys(AI_EXPANSION_MAP).length + ' AI expansions | ' + Object.keys(SEMANTIC_MATCHES).length + ' semantic queries ', 'color: #64748b; font-size: 12px;');

})();
