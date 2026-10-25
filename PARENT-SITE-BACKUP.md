# Backup: neocast.us v4 full page (Oct 24, 2026)

On Oct 24, 2026 neocast.us became a map-only Tastebud landing page (“Your Tastebud.” + Start now). This branch keeps the full v4 page exactly as it was live (commit 9d92894), so its sections can be reused for a separate site for the parent company, Neocast.

What is here, top to bottom of `index.html` (source: `source/index.src.html`):
- **Tastebud story:** “One algorithm for your entire life.”, the 3D life map, “You can see it. / control it. / learn from it.”
- **The app:** “Everything worth your time.” with the live Tastebud window (`source/gen_window.py`).
- **Ask:** “We find what you love.” on the living-room plate. **Decide:** “Big decision? Ask.” on the theme-park plate. **Rules:** “Your data. Your rules.” with the switches.
- **Curate your life.** on the brand glass, with the setup prompt.
- **Media chapter (for the parent site):** “The pro-human broadcast.”, the V15 launch film (YouTube UODT_Pe77VU), the *10 Humans vs. AI* opening, the five games, the six campus reels, VPRWRE (latest four from vprwre.com/posts.json).
- **Team (for the parent site):** “The founders.” Martin Lee (Founder & CEO) and Vedant Soni (Co-founder & CTO), portraits and bios.
- Footer with the Oct 24 lockup.

Assets: `assets/img/show/`, `assets/img/clips/`, `assets/img/founder.jpg`, `assets/img/vedant.jpg`, `assets/img/plates/`, `assets/brand/`, `assets/fonts/`, `assets/site.css`, `assets/site.js`, `assets/map3d.js`.
Build: `python3 source/build.py` (see README.md). Restore it to neocast.us with `git push origin parent-site-backup-v4:main` only if Martin asks.
