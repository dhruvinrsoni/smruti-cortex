// ===== Theme Toggle =====
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

const savedTheme = localStorage.getItem('theme') || 'light';
html.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
    const icon = themeToggle.querySelector('.theme-icon');
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ===== Store Links =====
const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/ecnkiihcifbfnhjblicfbppplobiicoi';
const EDGE_STORE_URL = CHROME_STORE_URL;

document.querySelectorAll('#chromeBtn, #chromeBtn2').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(CHROME_STORE_URL, '_blank');
    });
});

document.querySelectorAll('#edgeBtn, #edgeBtn2').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(EDGE_STORE_URL, '_blank');
    });
});

// ===== Smooth Scroll =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ===== Hero Screenshot Crossfade =====
(function initHeroCrossfade() {
    const screenshots = document.querySelectorAll('.hero-screenshot');
    if (screenshots.length < 2) return;
    let current = 0;
    setInterval(() => {
        screenshots[current].classList.remove('active');
        current = (current + 1) % screenshots.length;
        screenshots[current].classList.add('active');
    }, 4000);
})();

// ===== Intersection Observer for Animations =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -80px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll('.feature-row').forEach((row, i) => {
    row.style.animationDelay = `${i * 0.1}s`;
    observer.observe(row);
});

// ===== Active Nav Link =====
window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
    let current = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (scrollY >= sectionTop - 100) {
            current = section.getAttribute('id');
        }
    });
    navLinks.forEach(link => {
        link.style.color = link.getAttribute('href') === `#${current}` ? 'var(--accent)' : '';
    });
});

// ===== Search Simulator =====
const SAMPLE_HISTORY = [
    { title: 'GitHub REST API Documentation', url: 'docs.github.com/en/rest' },
    { title: 'GitHub - Pull Requests', url: 'github.com/pulls' },
    { title: 'Stack Overflow - How to center a div', url: 'stackoverflow.com/questions/19461521' },
    { title: 'Stack Overflow - JavaScript async await', url: 'stackoverflow.com/questions/40400367' },
    { title: 'MDN Web Docs - Array.prototype.map()', url: 'developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map' },
    { title: 'MDN Web Docs - CSS Flexbox', url: 'developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Flexbox' },
    { title: 'React Documentation - Getting Started', url: 'react.dev/learn' },
    { title: 'React Hooks - useState Tutorial', url: 'react.dev/reference/react/useState' },
    { title: 'TypeScript Handbook', url: 'typescriptlang.org/docs/handbook' },
    { title: 'npm - Package Search', url: 'npmjs.com/search' },
    { title: 'VS Code - Keyboard Shortcuts', url: 'code.visualstudio.com/docs/getstarted/keybindings' },
    { title: 'Amazon - Shopping Cart', url: 'amazon.com/gp/cart' },
    { title: 'Amazon Prime Video - Watch List', url: 'amazon.com/gp/video/watchlist' },
    { title: 'YouTube - Home', url: 'youtube.com' },
    { title: 'YouTube - How to learn programming', url: 'youtube.com/watch?v=programming101' },
    { title: 'Reddit - r/webdev', url: 'reddit.com/r/webdev' },
    { title: 'Reddit - r/programming', url: 'reddit.com/r/programming' },
    { title: 'Gmail - Inbox', url: 'mail.google.com/mail/u/0/#inbox' },
    { title: 'Google Docs - Untitled Document', url: 'docs.google.com/document/d/1abc' },
    { title: 'Google Drive - My Drive', url: 'drive.google.com/drive/my-drive' },
    { title: 'Notion - Project Dashboard', url: 'notion.so/workspace/project-dashboard' },
    { title: 'Slack - General Channel', url: 'app.slack.com/client/T01/C01general' },
    { title: 'Jira - Sprint Board', url: 'mycompany.atlassian.net/jira/boards/1' },
    { title: 'Wikipedia - History of the Internet', url: 'en.wikipedia.org/wiki/History_of_the_Internet' },
    { title: 'Wikipedia - Artificial Intelligence', url: 'en.wikipedia.org/wiki/Artificial_intelligence' },
    { title: 'BBC News - Technology', url: 'bbc.com/news/technology' },
    { title: 'Hacker News - Top Stories', url: 'news.ycombinator.com' },
    { title: 'Twitter / X - Home Timeline', url: 'x.com/home' },
    { title: 'LinkedIn - My Network', url: 'linkedin.com/mynetwork' },
    { title: 'Coursera - Machine Learning Course', url: 'coursera.org/learn/machine-learning' },
    { title: 'Udemy - Web Development Bootcamp', url: 'udemy.com/course/web-dev-bootcamp' },
    { title: 'Netflix - Continue Watching', url: 'netflix.com/browse' },
    { title: 'Spotify - Liked Songs', url: 'open.spotify.com/collection/tracks' },
    { title: 'ChatGPT - New Chat', url: 'chatgpt.com' },
    { title: 'Claude - Anthropic', url: 'claude.ai/new' },
    { title: 'Figma - Design File', url: 'figma.com/design/abc123' },
    { title: 'Canva - Create a Design', url: 'canva.com/design/create' },
    { title: 'eBay - Electronics Deals', url: 'ebay.com/deals/electronics' },
    { title: 'PayPal - Activity', url: 'paypal.com/myaccount/transactions' },
    { title: 'Google Maps - Directions', url: 'google.com/maps/dir' },
    { title: 'Uber Eats - Restaurants Near Me', url: 'ubereats.com/feed' },
    { title: 'Chrome Web Store - Extensions', url: 'chromewebstore.google.com' },
    { title: 'W3Schools - HTML Tutorial', url: 'w3schools.com/html' },
    { title: 'Vercel - Dashboard', url: 'vercel.com/dashboard' },
    { title: 'Docker Hub - Repositories', url: 'hub.docker.com/repositories' },
    { title: 'Trello - My Boards', url: 'trello.com/myboards' },
    { title: 'Medium - Technology Articles', url: 'medium.com/tag/technology' },
    { title: 'Pinterest - Home Feed', url: 'pinterest.com' },
    { title: 'Twitch - Live Channels', url: 'twitch.tv/directory' },
    { title: 'Zoom - Join Meeting', url: 'zoom.us/join' },
];

function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    let result = escaped;
    for (const term of terms) {
        const regex = new RegExp('(' + escapeRegex(escapeHtml(term)) + ')', 'gi');
        result = result.replace(regex, '<mark>$1</mark>');
    }
    return result;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchEntries(query, entries) {
    if (!query.trim()) return entries.slice(0, 15);
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results = [];
    for (const entry of entries) {
        const titleLower = entry.title.toLowerCase();
        const urlLower = entry.url.toLowerCase();
        let score = 0;
        let allMatch = true;
        for (const term of terms) {
            const inTitle = titleLower.includes(term);
            const inUrl = urlLower.includes(term);
            if (!inTitle && !inUrl) { allMatch = false; break; }
            if (inTitle) score += 2;
            if (inUrl) score += 1;
        }
        if (allMatch) results.push({ ...entry, score });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 15);
}

function renderResults(container, results, query) {
    container.innerHTML = '';
    for (const r of results) {
        const div = document.createElement('div');
        div.className = 'sim-result';
        div.innerHTML = `
            <div class="sim-favicon">🌐</div>
            <div class="sim-result-details">
                <div class="sim-result-title">${highlightMatch(r.title, query)}</div>
                <div class="sim-result-url">${highlightMatch(r.url, query)}</div>
            </div>
        `;
        container.appendChild(div);
    }
}

// Main popup simulator
(function initSearchSimulator() {
    const input = document.getElementById('simInput');
    const resultsEl = document.getElementById('simResults');
    const countEl = document.getElementById('simCount');
    if (!input || !resultsEl) return;

    let activeIndex = -1;

    function update() {
        const query = input.value;
        const results = searchEntries(query, SAMPLE_HISTORY);
        renderResults(resultsEl, results, query);
        countEl.textContent = query.trim() ? `${results.length} results` : '';
        activeIndex = -1;
    }

    input.addEventListener('input', update);

    input.addEventListener('keydown', (e) => {
        const items = resultsEl.querySelectorAll('.sim-result');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            updateActive(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, -1);
            updateActive(items);
        } else if (e.key === 'Escape') {
            input.value = '';
            update();
        }
    });

    function updateActive(items) {
        items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
        if (activeIndex >= 0 && items[activeIndex]) {
            items[activeIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    // Show initial results
    update();

    // Auto-type if user hasn't interacted after 3s of visibility
    let userTyped = false;
    input.addEventListener('focus', () => { userTyped = true; });
    input.addEventListener('input', () => { userTyped = true; });

    const simSection = document.getElementById('searchSimulator');
    if (simSection) {
        const simObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !userTyped) {
                simObserver.disconnect();
                setTimeout(() => {
                    if (!userTyped) autoType(input, 'amazon', update);
                }, 3000);
            }
        }, { threshold: 0.5 });
        simObserver.observe(simSection);
    }
})();

// Overlay simulator
(function initOverlaySimulator() {
    const input = document.getElementById('overlayInput');
    const resultsEl = document.getElementById('overlayResults');
    if (!input || !resultsEl) return;

    function update() {
        const query = input.value;
        const results = searchEntries(query, SAMPLE_HISTORY);
        renderResults(resultsEl, results.slice(0, 6), query);
    }

    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { input.value = ''; update(); }
    });
    update();

    // Auto-type for overlay
    let overlayTyped = false;
    input.addEventListener('focus', () => { overlayTyped = true; });
    input.addEventListener('input', () => { overlayTyped = true; });

    const overlayDemo = document.getElementById('overlayDemo');
    if (overlayDemo) {
        const overlayObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !overlayTyped) {
                overlayObserver.disconnect();
                setTimeout(() => {
                    if (!overlayTyped) autoType(input, 'youtube', update);
                }, 2000);
            }
        }, { threshold: 0.5 });
        overlayObserver.observe(overlayDemo);
    }
})();

// Auto-type helper
function autoType(input, text, callback) {
    let i = 0;
    const interval = setInterval(() => {
        if (i <= text.length) {
            input.value = text.substring(0, i);
            callback();
            i++;
        } else {
            clearInterval(interval);
        }
    }, 120);
}

// ===== Comparison Slider =====
(function initComparisonSlider() {
    const slider = document.getElementById('comparisonSlider');
    const handle = document.getElementById('comparisonHandle');
    if (!slider || !handle) return;

    const leftImg = slider.querySelector('.comparison-left');
    let isDragging = false;

    function setPosition(x) {
        const rect = slider.getBoundingClientRect();
        let pct = ((x - rect.left) / rect.width) * 100;
        pct = Math.max(5, Math.min(95, pct));
        leftImg.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
        handle.style.left = pct + '%';
    }

    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        e.preventDefault();
    });

    handle.addEventListener('touchstart', (e) => {
        isDragging = true;
    }, { passive: true });

    window.addEventListener('mousemove', (e) => {
        if (isDragging) setPosition(e.clientX);
    });

    window.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches[0]) setPosition(e.touches[0].clientX);
    }, { passive: true });

    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('touchend', () => { isDragging = false; });
})();

// ===== Tour Preview Strip =====
const TOUR_STEPS = [
    { id: 'search-speed',  title: 'Lightning Search',      screenshot: "./screenshots/Samvada Studio popup in action with keywords 'git smruti'Screenshot 2026-02-12 200635.png",                                                                                          category: 'core' },
    { id: 'deep-search',   title: 'Deep Search Scoring',   screenshot: './screenshots/Samvada Studio Settings Search Tab Screenshot 2026-03-02 205823.png',                                                                                                                   category: 'core' },
    { id: 'keyboard',      title: 'Keyboard Shortcuts',    screenshot: './screenshots/Samvada Studio quick search popup Screenshot 2026-02-03 000836.png',                                                                                                                    category: 'core' },
    { id: 'overlay',       title: 'Quick-Search Overlay',  screenshot: "./screenshots/Samvada Studio quick serach in action with keywords 'smruti git' Screenshot 2026-02-12 200309.png",                                                                                    category: 'core' },
    { id: 'display-modes', title: 'Display Modes',         screenshot: './screenshots/Samvada Studio settings page via popup html of extension in new tab Screenshot 2026-02-12 200431.png',                                                                                  category: 'core' },
    { id: 'ai-search',     title: 'AI Search — Dual-Phase',screenshot: "./screenshots/Samvada Studio AI Search in action 'spy' keyword hihglighted results with symantic results of 'agent' via ollama Screenshot 2026-03-02 021737.png",                                   category: 'ai' },
    { id: 'semantic',      title: 'Semantic Search',       screenshot: './screenshots/Samvada Studio Settings AI Tab Screenshot 2026-03-02 204945.png',                                                                                                                       category: 'ai' },
    { id: 'bookmarks',     title: 'Bookmark Search',       screenshot: "./screenshots/Samvada Studio popup in action with keywords 'git smruti'Screenshot 2026-02-12 200635.png",                                                                                            category: 'ai' },
    { id: 'privacy',       title: 'Privacy Controls',      screenshot: './screenshots/Samvada Studio Settings Privacy Tab Screenshot 2026-03-02 204959.png',                                                                                                                  category: 'privacy' },
    { id: 'data',          title: 'Data Management',       screenshot: './screenshots/Samvada Studio Settings Data Tab Screenshot 2026-03-02 205015.png',                                                                                                                     category: 'privacy' },
    { id: 'performance',   title: 'Performance Monitor',   screenshot: './screenshots/Samvada Studio Settings Data Tab Screenshot 2026-03-02 205015.png',                                                                                                                     category: 'advanced' },
    { id: 'analytics',     title: 'Search Analytics',      screenshot: './screenshots/Samvada Studio Settings Advanced Tab Screenshot 2026-03-02 205030.png',                                                                                                                 category: 'advanced' },
    { id: 'highlighting',  title: 'AI Green Highlights',   screenshot: "./screenshots/Samvada Studio AI Search in action 'spy' keyword hihglighted results with symantic results of 'agent' via ollama Screenshot 2026-03-02 021737.png",                                   category: 'core' },
    { id: 'settings',      title: '35+ Settings',          screenshot: './screenshots/Samvada Studio Settings General Tab Screenshot 2026-03-02 204909.png',                                                                                                                  category: 'advanced' },
    { id: 'omnibox',       title: 'Omnibox Search',        screenshot: './screenshots/Samvada Studio extension popup Screenshot 2026-02-03 000744.png',                                                                                                                       category: 'core' },
];

(function initTourStrip() {
    const strip = document.getElementById('tourStrip');
    if (!strip) return;

    TOUR_STEPS.forEach((step, i) => {
        const card = document.createElement('a');
        card.href = `tour.html#step/${i + 1}`;
        card.className = 'tour-card';
        card.innerHTML = `
            <img src="${step.screenshot}" alt="${step.title}" class="tour-card-img" loading="lazy">
            <div class="tour-card-title">${step.title}</div>
            <div class="tour-card-step">Step ${i + 1} of ${TOUR_STEPS.length}</div>
        `;
        strip.appendChild(card);
    });
})();

// ===== Scroll to Top on Page Load =====
window.addEventListener('load', () => {
    window.scrollTo(0, 0);
});

// ===== Screenshot Film Strip =====
async function initScreenshotStrip() {
    const container = document.getElementById('screenshot-strip');
    if (!container) return;
    const track = container.querySelector('.screenshot-track');
    const emptyMsg = container.querySelector('.screenshot-empty');
    try {
        const res = await fetch('./screenshots/list.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('No list');
        const list = await res.json();
        if (!Array.isArray(list) || list.length === 0) {
            emptyMsg.style.display = 'block';
            return;
        }
        const items = [];
        for (const name of list) {
            if (typeof name !== 'string' || name.includes('..') || name.includes('/')) continue;
            const img = document.createElement('img');
            img.className = 'screenshot-item';
            img.loading = 'lazy';
            img.alt = `Screenshot: ${name}`;
            img.src = './screenshots/' + encodeURIComponent(name).replace(/%2F/g, '/');
            img.onerror = () => { img.remove(); };
            track.appendChild(img);
            items.push(img);
        }
        if (items.length === 0) { emptyMsg.style.display = 'block'; return; }

        // Duplicate for seamless loop
        for (const it of items) {
            const clone = it.cloneNode(true);
            track.appendChild(clone);
        }

        items.forEach((el, idx) => {
            el.tabIndex = 0;
            el.dataset.index = String(idx);
            if (!el.alt || el.alt === '') el.alt = `Screenshot ${idx + 1}`;
        });

        // Lightbox
        const lightbox = document.getElementById('lightbox');
        const lbImg = lightbox && lightbox.querySelector('.lightbox-img');
        const lbCaption = lightbox && lightbox.querySelector('.lightbox-caption');
        const lbClose = lightbox && lightbox.querySelector('.lightbox-close');
        const lbPrev = lightbox && lightbox.querySelector('[data-action="prev"]');
        const lbNext = lightbox && lightbox.querySelector('[data-action="next"]');
        let currentIndex = 0;
        let lastFocused = null;

        function openLightbox(index) {
            const originals = Array.from(track.querySelectorAll('.screenshot-item')).slice(0, items.length);
            const src = originals[index] && originals[index].src;
            const caption = originals[index] && (originals[index].alt || `Screenshot ${index + 1}`);
            if (!lightbox || !lbImg || !src) return;
            lastFocused = document.activeElement;
            currentIndex = index;
            lightbox.classList.add('open');
            lightbox.setAttribute('aria-hidden', 'false');
            lbImg.src = src;
            lbImg.alt = caption || '';
            lbCaption.textContent = caption || '';
            lbImg.loading = 'eager';
            lbClose.focus();
            window.addEventListener('keydown', lightboxKeyHandler);
        }

        function closeLightbox() {
            if (!lightbox) return;
            lightbox.classList.remove('open');
            lightbox.setAttribute('aria-hidden', 'true');
            lbImg.src = '';
            lbCaption.textContent = '';
            window.removeEventListener('keydown', lightboxKeyHandler);
            if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
        }

        function showIndex(idx) {
            const originals = Array.from(track.querySelectorAll('.screenshot-item')).slice(0, items.length);
            const safe = ((idx % originals.length) + originals.length) % originals.length;
            const src = originals[safe] && originals[safe].src;
            const caption = originals[safe] && (originals[safe].alt || `Screenshot ${safe + 1}`);
            if (!lbImg) return;
            lbImg.src = src;
            lbImg.alt = caption || '';
            lbCaption.textContent = caption || '';
            currentIndex = safe;
        }

        function lightboxKeyHandler(e) {
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowRight') showIndex(currentIndex + 1);
            else if (e.key === 'ArrowLeft') showIndex(currentIndex - 1);
        }

        track.addEventListener('click', (e) => {
            const img = e.target.closest && e.target.closest('.screenshot-item');
            if (!img) return;
            openLightbox(Number(img.dataset.index || 0));
        });

        track.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const img = e.target.closest && e.target.closest('.screenshot-item');
                if (!img) return;
                openLightbox(Number(img.dataset.index || 0));
            }
        });

        if (lbClose) lbClose.addEventListener('click', closeLightbox);
        if (lbPrev) lbPrev.addEventListener('click', () => showIndex(currentIndex - 1));
        if (lbNext) lbNext.addEventListener('click', () => showIndex(currentIndex + 1));
        if (lightbox) lightbox.addEventListener('click', (e) => { if (e.target && e.target.dataset && e.target.dataset.action === 'close') closeLightbox(); });
        if (lbImg) lbImg.addEventListener('error', () => { lbCaption.textContent = 'Failed to load image.'; });

        // Auto-scroll
        let speed = 40;
        let running = true;
        let last = performance.now();

        function step(now) {
            const dt = Math.min(100, now - last) / 1000;
            last = now;
            if (running) {
                container.scrollLeft += speed * dt;
                const half = track.scrollWidth / 2;
                if (container.scrollLeft >= half) container.scrollLeft -= half;
            }
            requestAnimationFrame(step);
        }
        requestAnimationFrame(step);

        container.addEventListener('mouseenter', () => { running = false; });
        container.addEventListener('mouseleave', () => { running = true; last = performance.now(); });
        container.addEventListener('focusin', () => { running = false; });
        container.addEventListener('focusout', () => { running = true; last = performance.now(); });

        let isDown = false; let startX = 0; let scrollStart = 0;
        container.addEventListener('mousedown', (e) => { isDown = true; startX = e.pageX - container.offsetLeft; scrollStart = container.scrollLeft; container.style.cursor = 'grabbing'; });
        window.addEventListener('mouseup', () => { isDown = false; container.style.cursor = ''; });
        window.addEventListener('mousemove', (e) => { if (!isDown) return; e.preventDefault(); const x = e.pageX - container.offsetLeft; container.scrollLeft = scrollStart - (x - startX); });
    } catch (err) {
        emptyMsg.style.display = 'block';
        if (typeof console !== 'undefined' && console.debug) {
            console.debug('[screenshot-strip] no screenshots available or failed to load list.json');
        }
    }
}

window.addEventListener('load', () => { initScreenshotStrip(); });

// ===== Console Branding =====
console.log('%c SmrutiCortex ', 'background: #667eea; color: white; font-size: 20px; font-weight: bold; padding: 10px;');
console.log('%c Privacy-first browser history search. All data stays local. ', 'color: #64748b; font-size: 14px;');
console.log('%c GitHub: https://github.com/dhruvinrsoni/smruti-cortex ', 'color: #3b82f6; font-size: 12px;');
