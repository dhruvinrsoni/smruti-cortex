# SmrutiCortex Branding Guide

Visual identity and branding guidelines for SmrutiCortex.

---

## 🎨 Brand Identity

### Name

**SmrutiCortex** (one word, camelCase display)

- **Smruti** (स्मृति) — Sanskrit for "memory," "recollection," "remembered knowledge"
- **Cortex** — The brain's memory and processing center

**Tagline:** *"The Memory Cortex for Your Browser"*

**Alternate taglines:**
- "Ultra-fast, intelligent browser history search"
- "Remember everything... find it instantly"
- "Everything-like search for your browser"

### Pronunciation

- **Smruti**: SMROO-tee (स्मृति)
- **Cortex**: KOR-teks

---

## 🧠 Logo

### Concept

The logo represents the fusion of memory (brain) and technology (digital interface).

**Primary symbol:** A stylized brain icon (🧠)

**Design principles:**
- Clean and modern
- Recognizable at small sizes (16x16)
- Works in monochrome

### Icon Sizes

| Size | Usage |
|------|-------|
| 16x16 | Favicon, small toolbar |
| 32x32 | Toolbar (Retina) |
| 48x48 | Extensions page |
| 128x128 | Store listing, large display |

### Icon Files

```
src/assets/
├── icon16.png
├── icon48.png
├── icon128.png
└── logo.svg
```

---

## 🎨 Color Palette

### Primary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Brain Purple | `#6366F1` | 99, 102, 241 | Primary accent, links |
| Deep Purple | `#4F46E5` | 79, 70, 229 | Hover states, focus |
| Dark Gray | `#1F2937` | 31, 41, 55 | Text, backgrounds |

### Secondary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Success Green | `#10B981` | 16, 185, 129 | Success states |
| Warning Amber | `#F59E0B` | 245, 158, 11 | Warnings |
| Error Red | `#EF4444` | 239, 68, 68 | Errors |
| Info Blue | `#3B82F6` | 59, 130, 246 | Information |

### Neutral Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| White | `#FFFFFF` | 255, 255, 255 | Backgrounds |
| Gray 50 | `#F9FAFB` | 249, 250, 251 | Light backgrounds |
| Gray 100 | `#F3F4F6` | 243, 244, 246 | Borders |
| Gray 300 | `#D1D5DB` | 209, 213, 219 | Disabled |
| Gray 500 | `#6B7280` | 107, 114, 128 | Secondary text |
| Gray 700 | `#374151` | 55, 65, 81 | Primary text |
| Gray 900 | `#111827` | 17, 24, 39 | Headings |

### Dark Mode Colors

| Name | Hex | Usage |
|------|-----|-------|
| Dark Background | `#0F172A` | Main background |
| Dark Surface | `#1E293B` | Cards, surfaces |
| Dark Border | `#334155` | Borders |
| Light Text | `#F1F5F9` | Primary text |
| Muted Text | `#94A3B8` | Secondary text |

---

## 📝 Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 
             Roboto, Oxygen, Ubuntu, Cantarell, 
             'Open Sans', 'Helvetica Neue', sans-serif;
```

### Font Sizes

| Size | Pixels | Usage |
|------|--------|-------|
| xs | 12px | Captions, metadata |
| sm | 14px | Body text, results |
| base | 16px | Default |
| lg | 18px | Emphasis |
| xl | 20px | Headings |
| 2xl | 24px | Page titles |

### Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Normal | 400 | Body text |
| Medium | 500 | Emphasis, labels |
| Semibold | 600 | Subheadings |
| Bold | 700 | Headings, important |

---

## 📐 Spacing

Based on 4px grid system:

| Token | Pixels | Usage |
|-------|--------|-------|
| 1 | 4px | Tiny gaps |
| 2 | 8px | Small gaps, inline |
| 3 | 12px | Medium gaps |
| 4 | 16px | Standard padding |
| 5 | 20px | Section gaps |
| 6 | 24px | Large gaps |
| 8 | 32px | Section separation |

---

## 🔘 UI Components

### Buttons

```css
/* Primary */
background: #6366F1;
color: white;
border-radius: 6px;
padding: 8px 16px;

/* Hover */
background: #4F46E5;

/* Disabled */
background: #D1D5DB;
cursor: not-allowed;
```

### Input Fields

```css
border: 1px solid #D1D5DB;
border-radius: 6px;
padding: 8px 12px;
font-size: 14px;

/* Focus */
border-color: #6366F1;
outline: none;
box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
```

### Cards

```css
background: white;
border-radius: 8px;
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
padding: 16px;
```

### Result Items

```css
padding: 12px 16px;
border-bottom: 1px solid #F3F4F6;

/* Hover */
background: #F9FAFB;

/* Selected/Active */
background: #EEF2FF;
border-left: 3px solid #6366F1;
```

---

## ✍️ Voice & Tone

### Personality

- **Intelligent** but not condescending
- **Helpful** and solution-focused
- **Technical** when needed, accessible always
- **Efficient** — respect user's time

### Writing Style

**Do:**
- Use active voice
- Be concise
- Explain technical terms
- Focus on user benefits

**Don't:**
- Use jargon without explanation
- Be overly casual or formal
- Make assumptions about user skill level

### Example Messages

| Context | Message |
|---------|---------|
| Empty search | "Start typing to search your history" |
| No results | "No results found for '{query}'" |
| Loading | "Searching..." |
| Success | "Found {n} results" |
| Error | "Something went wrong. Please try again." |

---

## 📸 Visual Assets

### Store Screenshots

**Dimensions:**
- Primary: 1280x800 pixels
- Secondary: 640x400 pixels

**Requirements:**
- Show actual UI functionality
- Use consistent browser chrome
- Highlight key features
- Include captions if helpful

**Recommended shots:**
1. Search popup with results
2. Inline overlay on a webpage
3. Keyboard navigation in action
4. Settings/customization

### Promotional Graphics

| Asset | Size | Usage |
|-------|------|-------|
| Small tile | 440x280 | Store promotion |
| Marquee | 1400x560 | Featured placement |
| Social | 1200x630 | Open Graph, Twitter |

---

## 🏷️ Usage Guidelines

### Logo Usage

**Do:**
- Use official color palette
- Maintain clear space around logo
- Use on contrasting backgrounds

**Don't:**
- Stretch or distort
- Add effects (shadows, gradients)
- Use on busy backgrounds
- Change colors arbitrarily

### Name Usage

**Correct:**
- SmrutiCortex
- SmrutiCortex extension
- SmrutiCortex for Chrome

**Incorrect:**
- Smruti Cortex (with space)
- smruticortex (all lowercase)
- SMRUTICORTEX (all caps)
- SmrutiCortext (misspelled)

---

## 📂 Asset Locations

```
src/assets/
├── icon16.png       # 16x16 icon
├── icon48.png       # 48x48 icon
├── icon128.png      # 128x128 icon
└── logo.svg         # Vector logo

docs/
└── BRANDING.md      # This file
```

---

*Last updated: December 2025 | SmrutiCortex v2.0*
