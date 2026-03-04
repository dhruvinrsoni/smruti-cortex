// ===== Tour Step Data =====
const TOUR_STEPS = [
    {
        id: 'search-speed',
        title: 'Lightning Search',
        subtitle: 'Results appear in under 50ms as you type. No loading spinners, no waiting.',
        screenshot: './screenshots/Screenshot 2026-02-12 200635.png',
        highlight: { x: '3%', y: '8%', w: '70%', h: '10%' },
        category: 'core'
    },
    {
        id: 'vivek-search',
        title: 'Vivek Search Scoring',
        subtitle: '9-scorer ranking algorithm: recency, frequency, substring match, multi-token coverage, and more. Highlighted matches show exactly why each result ranked.',
        screenshot: './screenshots/Screenshot 2026-02-12 200309.png',
        highlight: { x: '3%', y: '20%', w: '94%', h: '55%' },
        category: 'core'
    },
    {
        id: 'keyboard',
        title: 'Keyboard Shortcuts',
        subtitle: 'Navigate results with arrow keys, open with Enter, copy links with Ctrl+C or Ctrl+M. Zero mouse needed.',
        screenshot: './screenshots/Screenshot 2026-02-12 200140.png',
        highlight: { x: '3%', y: '82%', w: '94%', h: '14%' },
        category: 'core'
    },
    {
        id: 'overlay',
        title: 'Quick-Search Overlay',
        subtitle: 'Press Ctrl+Shift+S on any webpage to search your history without leaving the page. Powered by Shadow DOM for zero style conflicts.',
        screenshot: './screenshots/Screenshot 2026-02-12 200309.png',
        highlight: { x: '5%', y: '5%', w: '90%', h: '90%' },
        category: 'core'
    },
    {
        id: 'display-modes',
        title: 'Display Modes',
        subtitle: 'Switch between compact list view and horizontal card view. Full tab mode for when you want the widest search experience.',
        screenshot: './screenshots/Screenshot 2026-02-12 200431.png',
        highlight: { x: '50%', y: '15%', w: '45%', h: '12%' },
        category: 'core'
    },
    {
        id: 'ai-search',
        title: 'AI Search (Ollama)',
        subtitle: 'Connect to your local Ollama instance for AI-powered keyword expansion. "war" becomes ["war", "battle", "combat"]. Entirely local, zero cloud calls.',
        screenshot: './screenshots/Screenshot 2026-02-12 195843.png',
        highlight: { x: '5%', y: '40%', w: '90%', h: '35%' },
        category: 'ai'
    },
    {
        id: 'semantic',
        title: 'Semantic Search',
        subtitle: 'Find pages by meaning, not just keywords. Search "ML tutorials" and find "machine learning guides". Uses local embedding models.',
        screenshot: './screenshots/Screenshot 2026-02-12 195900.png',
        highlight: { x: '5%', y: '55%', w: '90%', h: '25%' },
        category: 'ai'
    },
    {
        id: 'bookmarks',
        title: 'Bookmark Search',
        subtitle: 'Search bookmarks alongside browser history. Bookmarks show a star indicator and folder path breadcrumbs.',
        screenshot: './screenshots/Screenshot 2026-02-12 200033.png',
        highlight: { x: '5%', y: '70%', w: '90%', h: '15%' },
        category: 'ai'
    },
    {
        id: 'privacy',
        title: 'Privacy Controls',
        subtitle: 'Built-in sensitive URL blacklist covers banks, password managers, and payment sites. Add your own patterns. Toggle favicon loading for full privacy.',
        screenshot: './screenshots/Screenshot 2026-02-12 200033.png',
        highlight: { x: '5%', y: '15%', w: '90%', h: '50%' },
        category: 'privacy'
    },
    {
        id: 'data',
        title: 'Data Management',
        subtitle: 'Visual storage quota bar, one-click rebuild, reset settings, clear & rebuild, or full factory reset. You own your data.',
        screenshot: './screenshots/Screenshot 2026-02-12 200057.png',
        highlight: { x: '5%', y: '15%', w: '90%', h: '70%' },
        category: 'privacy'
    },
    {
        id: 'performance',
        title: 'Performance Monitor',
        subtitle: 'Real-time metrics: search count, average timing, min/max response, cache hit rate, memory usage, service worker health.',
        screenshot: './screenshots/Screenshot 2026-02-12 200109.png',
        highlight: { x: '5%', y: '20%', w: '90%', h: '40%' },
        category: 'advanced'
    },
    {
        id: 'analytics',
        title: 'Search Analytics',
        subtitle: 'Debug mode tracks every query. See top searches, query length distribution, scoring breakdowns. Export as JSON for bug reports.',
        screenshot: './screenshots/Screenshot 2026-02-12 200121.png',
        highlight: { x: '5%', y: '40%', w: '90%', h: '45%' },
        category: 'advanced'
    },
    {
        id: 'highlighting',
        title: 'Match Highlighting',
        subtitle: 'Matching text is highlighted in titles and URLs so you can see exactly why each result matched your query.',
        screenshot: './screenshots/Screenshot 2026-02-12 195843.png',
        highlight: { x: '5%', y: '15%', w: '90%', h: '20%' },
        category: 'core'
    },
    {
        id: 'settings',
        title: '35+ Settings',
        subtitle: '6 settings tabs: General, Search, AI, Privacy, Data, Advanced. Customize every aspect of search behavior, display, and diagnostics.',
        screenshot: './screenshots/Screenshot 2026-02-12 200431.png',
        highlight: { x: '50%', y: '5%', w: '48%', h: '90%' },
        category: 'advanced'
    },
    {
        id: 'omnibox',
        title: 'Omnibox Search',
        subtitle: 'Type "sc " in the address bar for quick search without even opening the extension. Results appear right in the browser suggestions.',
        screenshot: './screenshots/Screenshot 2026-02-12 195717.png',
        highlight: { x: '10%', y: '5%', w: '80%', h: '12%' },
        category: 'core'
    }
];

// ===== Tour State =====
let currentStep = 0;
let activeFilter = 'all';
let filteredSteps = [...TOUR_STEPS];
let autoplayInterval = null;

// ===== DOM Elements =====
const stepCounter = document.getElementById('stepCounter');
const screenshot = document.getElementById('tourScreenshot');
const highlight = document.getElementById('tourHighlight');
const stepTitle = document.getElementById('stepTitle');
const stepSubtitle = document.getElementById('stepSubtitle');
const progressBar = document.getElementById('progressBar');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const dotsContainer = document.getElementById('tourDots');
const filtersEl = document.getElementById('tourFilters');
const autoplayToggle = document.getElementById('autoplayToggle');

// ===== Theme Toggle =====
const tourThemeToggle = document.getElementById('tourThemeToggle');
const htmlEl = document.documentElement;

const savedTheme = localStorage.getItem('theme') || 'light';
htmlEl.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

tourThemeToggle.addEventListener('click', () => {
    const current = htmlEl.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    htmlEl.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
});

function updateThemeIcon(theme) {
    const icon = tourThemeToggle.querySelector('.theme-icon');
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ===== Render Step =====
function renderStep() {
    const step = filteredSteps[currentStep];
    if (!step) return;

    const globalIndex = TOUR_STEPS.indexOf(step);

    // Update counter
    stepCounter.textContent = `Step ${currentStep + 1} of ${filteredSteps.length}`;

    // Update screenshot
    screenshot.src = step.screenshot;
    screenshot.alt = step.title;

    // Update highlight
    if (step.highlight) {
        highlight.style.left = step.highlight.x;
        highlight.style.top = step.highlight.y;
        highlight.style.width = step.highlight.w;
        highlight.style.height = step.highlight.h;
        highlight.classList.add('visible');
    } else {
        highlight.classList.remove('visible');
    }

    // Update text
    stepTitle.textContent = step.title;
    stepSubtitle.textContent = step.subtitle;

    // Update progress
    const pct = ((currentStep + 1) / filteredSteps.length) * 100;
    progressBar.style.width = pct + '%';

    // Update nav buttons
    prevBtn.disabled = currentStep === 0;
    nextBtn.disabled = currentStep === filteredSteps.length - 1;

    // Update dots
    const dots = dotsContainer.querySelectorAll('.tour-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentStep);
    });
}

// ===== Build Dots =====
function buildDots() {
    dotsContainer.innerHTML = '';
    filteredSteps.forEach((step, i) => {
        const dot = document.createElement('button');
        dot.className = 'tour-dot' + (i === currentStep ? ' active' : '');
        dot.title = step.title;
        dot.addEventListener('click', () => {
            currentStep = i;
            renderStep();
        });
        dotsContainer.appendChild(dot);
    });
}

// ===== Navigation =====
prevBtn.addEventListener('click', () => {
    if (currentStep > 0) {
        currentStep--;
        renderStep();
    }
});

nextBtn.addEventListener('click', () => {
    if (currentStep < filteredSteps.length - 1) {
        currentStep++;
        renderStep();
    }
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentStep < filteredSteps.length - 1) {
            currentStep++;
            renderStep();
        }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentStep > 0) {
            currentStep--;
            renderStep();
        }
    } else if (e.key === 'Home') {
        e.preventDefault();
        currentStep = 0;
        renderStep();
    } else if (e.key === 'End') {
        e.preventDefault();
        currentStep = filteredSteps.length - 1;
        renderStep();
    }
});

// Touch/swipe support
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    // Only handle horizontal swipes (not vertical scrolls)
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0 && currentStep < filteredSteps.length - 1) {
            currentStep++;
            renderStep();
        } else if (dx > 0 && currentStep > 0) {
            currentStep--;
            renderStep();
        }
    }
}, { passive: true });

// ===== Filters =====
filtersEl.addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;

    const filter = pill.dataset.filter;
    activeFilter = filter;

    // Update pill states
    filtersEl.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');

    // Filter steps
    if (filter === 'all') {
        filteredSteps = [...TOUR_STEPS];
    } else {
        filteredSteps = TOUR_STEPS.filter(s => s.category === filter);
    }

    currentStep = 0;
    buildDots();
    renderStep();
});

// ===== Auto-play =====
autoplayToggle.addEventListener('change', () => {
    if (autoplayToggle.checked) {
        autoplayInterval = setInterval(() => {
            if (currentStep < filteredSteps.length - 1) {
                currentStep++;
            } else {
                currentStep = 0;
            }
            renderStep();
        }, 5000);
    } else {
        clearInterval(autoplayInterval);
        autoplayInterval = null;
    }
});

// ===== Deep Link Support =====
function handleHash() {
    const hash = window.location.hash;
    if (!hash) return;

    // Format: #step/N (1-indexed) or #step/id
    const stepMatch = hash.match(/^#step\/(.+)$/);
    if (stepMatch) {
        const val = stepMatch[1];
        const num = parseInt(val, 10);

        if (!isNaN(num) && num >= 1 && num <= TOUR_STEPS.length) {
            // Reset to all filter to ensure step is visible
            activeFilter = 'all';
            filteredSteps = [...TOUR_STEPS];
            filtersEl.querySelectorAll('.filter-pill').forEach(p => {
                p.classList.toggle('active', p.dataset.filter === 'all');
            });
            currentStep = num - 1;
            buildDots();
            renderStep();
        } else {
            // Try by ID
            const idx = TOUR_STEPS.findIndex(s => s.id === val);
            if (idx >= 0) {
                activeFilter = 'all';
                filteredSteps = [...TOUR_STEPS];
                filtersEl.querySelectorAll('.filter-pill').forEach(p => {
                    p.classList.toggle('active', p.dataset.filter === 'all');
                });
                currentStep = idx;
                buildDots();
                renderStep();
            }
        }
    }
}

// ===== Initialize =====
buildDots();
renderStep();
handleHash();
window.addEventListener('hashchange', handleHash);

// Console branding
console.log('%c SmrutiCortex Feature Tour ', 'background: #667eea; color: white; font-size: 16px; font-weight: bold; padding: 8px;');
