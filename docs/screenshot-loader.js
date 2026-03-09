// ===== Screenshot Loader — Single Source of Truth =====
// All screenshot references flow through manifest.json.
// HTML uses data-screenshot="sectionId" attributes; this module resolves them.

let _manifest = null;

async function getManifest() {
    if (_manifest) return _manifest;
    try {
        const res = await fetch('./screenshots/manifest.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('manifest fetch failed');
        _manifest = await res.json();
    } catch {
        _manifest = [];
    }
    return _manifest;
}

function screenshotUrl(entry) {
    return './screenshots/' + encodeURIComponent(entry.file).replace(/%2F/g, '/');
}

function addFallback(img) {
    img.onerror = () => {
        img.onerror = null;
        img.style.opacity = '0.15';
        img.alt = 'Screenshot unavailable';
    };
}

// Resolve all <img data-screenshot="sectionId"> to real src from manifest
async function resolveScreenshots() {
    const manifest = await getManifest();
    document.querySelectorAll('img[data-screenshot]').forEach(img => {
        const sectionId = img.dataset.screenshot;
        const entry = manifest.find(e => e.sections && e.sections.includes(sectionId));
        if (entry) {
            img.src = screenshotUrl(entry);
            if (!img.alt) img.alt = entry.alt || '';
        }
        addFallback(img);
    });
}

// Build hero carousel from entries tagged "hero" (order = manifest order)
async function buildHeroCarousel(containerId) {
    const manifest = await getManifest();
    const entries = manifest.filter(e => e.sections && e.sections.includes('hero'));
    const container = document.getElementById(containerId);
    if (!container || entries.length === 0) return;
    container.innerHTML = '';
    entries.forEach((entry, i) => {
        const img = document.createElement('img');
        img.src = screenshotUrl(entry);
        img.alt = entry.alt || '';
        img.className = 'hero-screenshot' + (i === 0 ? ' active' : '');
        img.loading = i === 0 ? 'eager' : 'lazy';
        addFallback(img);
        container.appendChild(img);
    });
}

// Build mini carousel for feature sections with multiple images (e.g. AI Search)
async function buildMiniCarousel(containerId, sectionId) {
    const manifest = await getManifest();
    const entries = manifest.filter(e => e.sections && e.sections.includes(sectionId));
    const container = document.getElementById(containerId);
    if (!container || entries.length === 0) return;
    container.innerHTML = '';
    entries.forEach((entry, i) => {
        const img = document.createElement('img');
        img.src = screenshotUrl(entry);
        img.alt = entry.alt || '';
        img.className = 'feature-img carousel-img' + (i === 0 ? ' active' : '');
        img.loading = 'lazy';
        addFallback(img);
        container.appendChild(img);
    });
    if (entries.length > 1) {
        let idx = 0;
        setInterval(() => {
            const imgs = container.querySelectorAll('.carousel-img');
            if (imgs.length === 0) return;
            imgs[idx].classList.remove('active');
            idx = (idx + 1) % imgs.length;
            imgs[idx].classList.add('active');
        }, 3000);
    }
}

// Build filmstrip from ALL manifest entries (replaces list.json-based approach)
async function buildFilmstrip(trackEl, lightbox) {
    const manifest = await getManifest();
    if (!trackEl || manifest.length === 0) return [];
    trackEl.innerHTML = '';
    const items = [];
    manifest.forEach((entry, idx) => {
        const img = document.createElement('img');
        img.className = 'screenshot-item';
        img.loading = 'lazy';
        img.alt = entry.alt || `Screenshot: ${entry.id}`;
        img.src = screenshotUrl(entry);
        img.tabIndex = 0;
        img.dataset.index = String(idx);
        img.onerror = () => img.remove();
        trackEl.appendChild(img);
        items.push(img);
    });
    // Duplicate for seamless loop
    items.forEach(it => trackEl.appendChild(it.cloneNode(true)));
    return items;
}

// Get tour steps — entries that have a .tour object
async function getTourSteps() {
    const manifest = await getManifest();
    return manifest.filter(e => e.tour).map(e => ({
        id: e.id,
        title: e.tour.title,
        subtitle: e.tour.subtitle,
        screenshot: screenshotUrl(e),
        highlight: e.tour.highlight || null,
        category: e.tour.category || 'core'
    }));
}

// Get tour preview cards for index page strip
async function buildTourStrip(containerId) {
    const steps = await getTourSteps();
    const strip = document.getElementById(containerId);
    if (!strip || steps.length === 0) return;
    strip.innerHTML = '';
    steps.forEach((step, i) => {
        const card = document.createElement('a');
        card.href = `feature-tour.html#step/${i + 1}`;
        card.className = 'tour-card';
        card.innerHTML = `
            <img src="${step.screenshot}" alt="${step.title}" class="tour-card-img" loading="lazy">
            <div class="tour-card-title">${step.title}</div>
            <div class="tour-card-step">Step ${i + 1} of ${steps.length}</div>
        `;
        strip.appendChild(card);
    });
}

window.ScreenshotLoader = {
    getManifest,
    screenshotUrl,
    resolveScreenshots,
    buildHeroCarousel,
    buildMiniCarousel,
    buildFilmstrip,
    getTourSteps,
    buildTourStrip
};
