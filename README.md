# Keepsake

A digital scrapbook that starts before the event. Type your plan, get pages with photo prompts, shoot with a disposable-camera look, then stick everything down by hand.

Live app: https://hirographics.github.io/Keepsake/

## Layout

- `app/` is the whole app (plain HTML, CSS and JavaScript, no build step). This folder is what gets published.
- `app/packs/` holds scrap packs. Each pack has a `pack.json` that lists its stickers, stamps, tapes and papers.
- `app/templates/` holds the Procreate templates for drawing your own packs.
- `tools/` holds the scripts that make the starter pack, the templates and the offline file list.
- `artifact.html` is the test copy page used inside Claude.

## Updating

After changing any file in `app/`, run `python3 tools/build_sw.py` so installed copies pick up the change, then push to `main`. GitHub Pages publishes it within a minute or two.
