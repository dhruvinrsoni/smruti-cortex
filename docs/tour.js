// ===== Tour Step Data (loaded from manifest.json via ScreenshotLoader) =====
let TOUR_STEPS = [];

// ===== Tour State =====
let currentStep = 0;
let activeFilter = 'all';
let filteredSteps = [];
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

// ===== Highlight Offset for object-fit: contain =====
// When object-fit: contain is used, the image may be letterboxed inside its container.
// The highlight is positioned relative to the container, so we need to compensate
// for the offset between the container and the actual rendered image content.
function applyHighlightOffset() {
    const wrap = document.getElementById('screenshotWrap');
    if (!screenshot.naturalWidth || !wrap) return;

    const wrapW = wrap.clientWidth;
    const wrapH = wrap.clientHeight;
    if (wrapW === 0 || wrapH === 0) return;

    const imgAspect = screenshot.naturalWidth / screenshot.naturalHeight;
    const wrapAspect = wrapW / wrapH;

    let scaleX, scaleY, offsetX, offsetY;
    if (imgAspect > wrapAspect) {
        // Image wider than container — letterboxed top/bottom
        const imgHeight = wrapW / imgAspect;
        scaleX = 1;
        scaleY = imgHeight / wrapH;
        offsetX = 0;
        offsetY = (wrapH - imgHeight) / 2;
    } else {
        // Image taller — letterboxed left/right
        const imgWidth = wrapH * imgAspect;
        scaleX = imgWidth / wrapW;
        scaleY = 1;
        offsetX = (wrapW - imgWidth) / 2;
        offsetY = 0;
    }

    highlight.style.transformOrigin = 'top left';
    highlight.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY})`;
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
        // Apply offset after image loads (natural dimensions needed)
        if (screenshot.complete && screenshot.naturalWidth) {
            applyHighlightOffset();
        }
    } else {
        highlight.classList.remove('visible');
        highlight.style.transform = '';
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

// Recalculate highlight offset when image loads or window resizes
screenshot.addEventListener('load', applyHighlightOffset);
window.addEventListener('resize', applyHighlightOffset);

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

// ===== Initialize (async — loads tour steps from manifest.json) =====
(async function initTour() {
    if (window.ScreenshotLoader) {
        TOUR_STEPS = await ScreenshotLoader.getTourSteps();
    }
    if (TOUR_STEPS.length === 0) {
        // Graceful degradation: show message if no tour data
        if (stepTitle) stepTitle.textContent = 'Tour data unavailable';
        if (stepSubtitle) stepSubtitle.textContent = 'Could not load screenshot manifest.';
        return;
    }
    filteredSteps = [...TOUR_STEPS];
    buildDots();
    renderStep();
    handleHash();
    window.addEventListener('hashchange', handleHash);
})();

// Console branding
console.log('%c SmrutiCortex Feature Tour ', 'background: #667eea; color: white; font-size: 16px; font-weight: bold; padding: 8px;');
