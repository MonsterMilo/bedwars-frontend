# Rebuilt site pages

Source for `index.html`, `player.html`, `nicks.html`, `leaderboards.html` and `unlock.html` (Prism theme).

```
cd site-src
npm ci
npm run build   # writes ../app/ and the page HTML at the repo root
npm test
```

- Pages: `src/pages/<page>.jsx` with a template in `html/<page>.html`. The shared nav, key and settings are in `src/ui/Shell.jsx`; the site map is `src/lib/site.js`.
- Built files are hashed (`app/<page>-<hash>.js`), so no `?v=` bumps are needed. Commit `app/` and the root HTML after building.
- No inline scripts: the pages run under a strict Content-Security-Policy (`html/_head.html`).
- `npm run cosmetic-ids` rebuilds the Nick Finder's cosmetic list; `python3 tools/item-icons.py` rebuilds the quick buy icons.
