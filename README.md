# Finconsult 2.0

Modernized front-end scaffold using React, TypeScript, Vite and Tailwind CSS, with a sage/mint visual system and Font Awesome Free icons. The existing calculator, anti-fraud quiz and AI-provider workflow are retained in a compatibility layer under `public/legacy` while the UI is migrated into native React components incrementally.

## Requirements
- Node.js 20.19+ or 22.12+
- npm

## Development
```bash
npm install
npm run dev -- --host 0.0.0.0
```

## Production build
```bash
npm run build
npm run preview
```

Font Awesome Free is loaded from cdnjs. An internet connection is needed for those icons and Google Fonts. The app itself and its styles are bundled locally.

## Important security note
This remains a browser-side prototype. API keys entered in the app are visible to the browser and should not be used for production. Put provider calls behind a secured backend before public launch.
