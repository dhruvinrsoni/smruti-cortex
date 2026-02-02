// Theme Toggle
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

// Load theme from localStorage
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

// Typing Animation
const typingText = document.getElementById('typingText');
const phrases = [
    'github api',
    'react documentation',
    'typescript tutorial',
    'chrome extension',
    'machine learning'
];

let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;

function typeEffect() {
    const currentPhrase = phrases[phraseIndex];
    
    if (isDeleting) {
        typingText.textContent = currentPhrase.substring(0, charIndex - 1);
        charIndex--;
    } else {
        typingText.textContent = currentPhrase.substring(0, charIndex + 1);
        charIndex++;
    }
    
    if (!isDeleting && charIndex === currentPhrase.length) {
        setTimeout(() => { isDeleting = true; }, 1500);
    } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
    }
    
    const typingSpeed = isDeleting ? 50 : 100;
    setTimeout(typeEffect, typingSpeed);
}

setTimeout(typeEffect, 500);

// Demo Search Animation
const demoInput = document.getElementById('demoInput');
const demoResults = document.getElementById('demoResults');

const sampleResults = [
    { title: 'GitHub REST API Documentation', url: 'docs.github.com/en/rest' },
    { title: 'GitHub API v3 - Issues', url: 'api.github.com/repos/issues' },
    { title: 'Awesome GitHub API', url: 'github.com/awesome/api' }
];

function showDemoResults() {
    demoResults.innerHTML = sampleResults.map(result => `
        <div class="demo-result" style="
            padding: 12px;
            border: 1px solid var(--border);
            border-radius: 8px;
            margin-top: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        " onmouseover="this.style.background='var(--bg-secondary)'" 
           onmouseout="this.style.background='var(--bg-card)'">
            <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                ${result.title}
            </div>
            <div style="font-size: 0.9rem; color: var(--text-secondary); font-family: monospace;">
                ${result.url}
            </div>
        </div>
    `).join('');
}

// Auto-show demo results after 2 seconds
setTimeout(showDemoResults, 2000);

// Demo Tabs
const demoTabs = document.querySelectorAll('.demo-tab');
const demoViews = document.querySelectorAll('.demo-view');

demoTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetDemo = tab.getAttribute('data-demo');
        
        demoTabs.forEach(t => t.classList.remove('active'));
        demoViews.forEach(v => v.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(`demo-${targetDemo}`).classList.add('active');
    });
});

// Smooth Scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// Store Links
const CHROME_STORE_URL = 'https://chrome.google.com/webstore/detail/smruticortex/YOUR_EXTENSION_ID';
const EDGE_STORE_URL = 'https://microsoftedge.microsoft.com/addons/detail/smruticortex/YOUR_EXTENSION_ID';

document.querySelectorAll('#chromeBtn, #chromeBtn2').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        // For now, show coming soon alert
        alert('Coming soon! Extension is currently in review. Check back soon!');
        // Later: window.open(CHROME_STORE_URL, '_blank');
    });
});

document.querySelectorAll('#edgeBtn, #edgeBtn2').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        alert('Coming soon! Extension is currently in review. Check back soon!');
        // Later: window.open(EDGE_STORE_URL, '_blank');
    });
});

// Intersection Observer for Animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.8s ease both';
        }
    });
}, observerOptions);

// Observe feature cards
document.querySelectorAll('.feature-card').forEach(card => {
    observer.observe(card);
});

// Scroll to Top on Page Load
window.addEventListener('load', () => {
    window.scrollTo(0, 0);
});

// Add active state to nav links based on scroll position
window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
    
    let current = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (scrollY >= sectionTop - 100) {
            current = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.style.color = 'var(--text-secondary)';
        if (link.getAttribute('href') === `#${current}`) {
            link.style.color = 'var(--accent)';
        }
    });
});

console.log('%c SmrutiCortex ', 'background: #667eea; color: white; font-size: 20px; font-weight: bold; padding: 10px;');
console.log('%c Privacy-first browser history search. All data stays local. ', 'color: #64748b; font-size: 14px;');
console.log('%c GitHub: https://github.com/dhruvinrsoni/smruti-cortex ', 'color: #3b82f6; font-size: 12px;');
