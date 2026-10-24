# neocast.us

Company site for **Neocast**, the pro-human broadcast. It leads with the flagship product, **Tastebud**, then features Neocast media (the launch film, *10 Humans vs. AI*, the campus reels and the newsroom VPRWRE) and ends with the founders, Martin Lee and Vedant Soni.
Static, single page, served by GitHub Pages from the repository root (custom domain in `CNAME`). Version 1 (black and white, Montserrat) is kept on branch `v1-black-and-white`.

## Version 3 (Oct 24, 2026): the page moves as you scroll

- Hero: the headline rises line by line and the life map opens, all settled within about 1.2 s.
- Tastebud, desktop: the map holds in place while three steps change it. *You can see it*: the groups unravel from You. *You can control it*: “Legal dramas” is forgotten and “Harvey Specter” is saved. *You can learn from it*: the Witty trait travels to Tony Stark (78% match) and Disneyland picks up Crispy. On phones the map plays the same story as it passes.
- Everywhere else: headings rise in masked lines, cards pop, swing, shutter open or deal in with short staggers, meters fill and numbers count up once. The *10 Humans vs. AI* still opens from a framed window to full bleed, and the footer lockup settles in at the end.
- Reduced motion (or no JavaScript) shows the finished page: nothing hidden, nothing moving.
- Motion follows the Taste Skill (tasteskill.dev) motion rules: reveals fire once at about 88% of the viewport, 60–90 ms staggers, expo easing, one requestAnimationFrame loop for the scroll scenes, transforms and opacity only. The Neocast brand wins where the two differ (gradient accent, glass inside product fragments).

## Files

- `index.html`, `404.html`, `assets/site.css`, `assets/site.js`: edit directly. The life map is precomputed HTML/SVG (desktop and phone layouts, sizes in container units); every node, leaf and edge carries `data-*` hooks that `site.js` drives.
- Look: the Neocast house design language. Paper `#F6F3F0`, ink `#181818`, Manrope only, one accent (the brand gradient `#FD9013 → #FD3155 → #E409CF → #4315FF`) on emphasis words, names, primary buttons and active states, never behind UI. No lavender.
- `assets/brand/`: Martin's Oct 24, 2026 brand-standard vector logos (kit crops, unedited; see `assets/brand/README.md`). Never retype, redraw, recolour or stretch them.
- `assets/fonts/`: Manrope variable (SIL Open Font License).
- `assets/img/show/` and `assets/img/clips/`: *10 Humans vs. AI* set stills and campus reel covers (same files as 10humansvsai.com). `assets/img/founder.jpg` (Martin) and `assets/img/vedant.jpg` (Vedant, from vedantsoni.com): founder portraits, both in grayscale. `assets/img/og.png`: share image.
- The launch film loads from YouTube only when someone presses play.
- The VPRWRE list shows four built-in stories and swaps in the newest four from `https://vprwre.com/posts.json` in the browser when it can.
- Get Tastebud links go to `https://neocast.live/tastebud`; the setup prompt points assistants at `https://neocast.live/tastebud/skill`.
