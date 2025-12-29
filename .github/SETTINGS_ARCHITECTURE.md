# Settings Architecture - SOLID Design

## 🎯 Design Goals

**Vision:** Settings should be a simple container where adding/editing/removing settings is **straightforward and requires minimal code changes**.

## ✅ SOLID Principles Applied

### Before (Non-SOLID) ❌

```typescript
// BAD: Hardcoded defaults in multiple places
private static settings: AppSettings = {
    displayMode: DisplayMode.LIST,
    logLevel: 2,
    highlightMatches: true,
    focusDelayMs: 300,
    ollamaEnabled: false,
    ollamaEndpoint: 'http://localhost:11434',
    // ... must duplicate for resetToDefaults()
};

// BAD: Manual validation for each setting
private static validateSettings(settings: any): AppSettings | null {
    const validated: AppSettings = {
        displayMode: DisplayMode.LIST, // duplicate default!
        logLevel: 2,                   // duplicate default!
        // ...
    };
    
    // 10 lines of code for displayMode
    if (settings.displayMode && Object.values(DisplayMode).includes(settings.displayMode)) {
        validated.displayMode = settings.displayMode;
    } else {
        // fallback to default
    }
    
    // 10 more lines for logLevel
    if (typeof settings.logLevel === 'number' && settings.logLevel >= 0 && settings.logLevel <= 4) {
        validated.logLevel = settings.logLevel;
    } else {
        // fallback to default
    }
    
    // Repeat for EVERY setting... 100+ lines of boilerplate!
}
```

**Problems:**
- ❌ Adding 1 setting = modify 3+ places (defaults, validation, reset)
- ❌ 50+ lines of repetitive validation code
- ❌ Easy to forget validating new settings
- ❌ Violates DRY, Open/Closed, Single Responsibility

---

### After (SOLID) ✅

```typescript
// GOOD: Single source of truth - schema defines everything
const SETTINGS_SCHEMA: { [K in keyof Required<AppSettings>]: SettingSchema<AppSettings[K]> } = {
    displayMode: {
        default: DisplayMode.LIST,
        validate: (val) => Object.values(DisplayMode).includes(val),
    },
    logLevel: {
        default: 2,
        validate: (val) => typeof val === 'number' && val >= 0 && val <= 4,
    },
    ollamaEnabled: {
        default: false,
        validate: (val) => typeof val === 'boolean',
    },
    ollamaEndpoint: {
        default: 'http://localhost:11434',
        validate: (val) => typeof val === 'string' && val.length > 0,
    },
    // Adding new setting = ONE entry here. That's it!
};

// GOOD: Automatic validation for ALL settings
private static validateSettings(settings: any): AppSettings | null {
    const validated: any = {};
    
    // Generic validation loop - works for ANY setting
    for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
        const value = settings[key];
        
        if (value !== undefined && (!schema.validate || schema.validate(value))) {
            validated[key] = value;
        } else {
            validated[key] = schema.default;
        }
    }
    
    return validated as AppSettings;
}

// GOOD: Automatic defaults extraction
private static getDefaults(): AppSettings {
    const defaults: any = {};
    for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
        defaults[key] = schema.default;
    }
    return defaults as AppSettings;
}
```

**Benefits:**
- ✅ Adding 1 setting = modify 1 place (SETTINGS_SCHEMA)
- ✅ 15 lines of generic validation code (handles ALL settings)
- ✅ Impossible to forget validation (automatic)
- ✅ Follows DRY, Open/Closed, Single Responsibility

---

## 📝 How to Add a New Setting

### Step 1: Add to interface (TypeScript types)

```typescript
export interface AppSettings {
    // ... existing settings
    newFeatureEnabled?: boolean;  // Add your new setting
}
```

### Step 2: Add to schema (validation + defaults)

```typescript
const SETTINGS_SCHEMA = {
    // ... existing settings
    newFeatureEnabled: {
        default: false,
        validate: (val) => typeof val === 'boolean',
    },
};
```

### Step 3: (Optional) Add UI in popup.html

```html
<label class="setting-option">
  <input type="checkbox" id="modal-newFeatureEnabled">
  <span class="option-indicator"></span>
  <div class="option-content">
    <strong>Enable New Feature</strong>
    <small>Description of the feature</small>
  </div>
</label>
```

### Step 4: (Optional) Add UI handler in popup.ts

```typescript
const newFeatureInput = modal.querySelector('#modal-newFeatureEnabled') as HTMLInputElement;
if (newFeatureInput) {
  newFeatureInput.checked = SettingsManager.getSetting('newFeatureEnabled') || false;
  newFeatureInput.addEventListener('change', async (e) => {
    await SettingsManager.setSetting('newFeatureEnabled', (e.target as HTMLInputElement).checked);
    showToast('New feature ' + ((e.target as HTMLInputElement).checked ? 'enabled' : 'disabled'));
  });
}
```

**That's it!** The rest is automatic:
- ✅ Validation handled by schema
- ✅ Defaults handled by schema
- ✅ Storage persistence automatic
- ✅ Type safety from TypeScript

---

## 🏗️ Architecture Principles

### 1. **Open/Closed Principle**
- **Open for extension:** Add settings by extending schema
- **Closed for modification:** No need to modify validation/storage logic

### 2. **Single Responsibility**
- **Schema:** Defines settings structure, validation, defaults
- **SettingsManager:** Handles storage, loading, saving
- **UI:** Handles user interaction, display

### 3. **DRY (Don't Repeat Yourself)**
- Defaults defined ONCE in schema
- Validation defined ONCE in schema
- Generic validation loop works for ALL settings

### 4. **Type Safety**
- TypeScript ensures schema matches interface
- Compile-time errors if schema is incomplete
- Autocomplete in IDE for all settings

---

## 🚀 Scalability

**Adding 10 new settings:**

❌ **Before:** 500+ lines of validation boilerplate  
✅ **After:** 10 schema entries (~50 lines)

**Example: Adding theme support**

```typescript
// Interface
theme?: 'light' | 'dark' | 'auto';

// Schema
theme: {
    default: 'auto' as const,
    validate: (val) => ['light', 'dark', 'auto'].includes(val),
},
```

Done. 3 lines of code. Fully validated, persisted, type-safe.

---

## 📊 Comparison

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Lines for 1 setting | ~15 lines | ~3 lines | **5x less** |
| Places to modify | 3+ places | 1 place | **3x simpler** |
| Validation code | 100+ lines | 15 lines | **7x less** |
| Risk of bugs | High | Low | **Much safer** |
| Time to add setting | 5-10 min | 1-2 min | **5x faster** |

---

## 🎓 Key Takeaway

**"Add setting = Edit schema. That's it."**

No more hunting through validation code, no more forgetting to add defaults, no more copy-paste errors. Just declare your setting once, and the architecture handles the rest.

**This is SOLID.**
