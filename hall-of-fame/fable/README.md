# Hall of Fame prototype (Fable entry)

Standalone page, not wired into the site. Open `index.html` in a browser (it loads three.js from jsDelivr and fonts from Google Fonts, everything else is inline).

What it is: a cinematic 3D corridor you walk through. Rank 20 stands nearest the entrance, rank 1 (the Final Boss) on a lit dais at the far end, so walking forward climbs the leaderboard. Each sweat is a 3D figure in their real Minecraft skin on a plinth with a wall plaque; stand in front of one and a side panel shows every stat we have, who beat them, dates and notes.

- Data: live `GET /sweats` from the backend on 2026-11-02 (958 sweats), top 20 by index (FKDR² × stars), one entry per player (best stats kept, all beaten-by flags and notes merged). Cheaters count and are stamped CHEATER.
- Controls: W/S or arrow keys, scroll wheel, drag to look, click a sweat to walk up to them, ▶ Tour for an automatic walk-through. Touch: drag up/down to walk.
- Rebuild the data: `python3 build-data.py` (reads a saved `/sweats` dump, fetches skins from mc-heads.net, writes `hof-data.json`), then paste it into the `hof-data` script tag.
