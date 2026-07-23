# Ravân

A mobile-first progressive web app for learning to read Persian through adaptive multiple-choice practice.

## What it does

- Builds from short, frequent letter patterns toward longer everyday words
- Uses spaced repetition: misses return quickly; successful words wait longer
- Fades transliteration as the learner improves, replacing it with English meaning
- Tracks accuracy, answer speed, daily streaks, and per-word progress locally
- Works offline after the first visit

## Word data

The starter set lives at `src/data/words.json`. Each entry has a stable `id`, Persian spelling, transliteration, English meaning, difficulty level, frequency rank, and letter list. Optional pedagogical vowel forms are keyed by the same IDs in `src/data/vowels.json`; words without an entry safely fall back to their standard spelling. Replace or extend these files to scale toward 500+ words.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` builds and deploys every push to `main`.

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main`, then follow the deployment in the **Actions** tab.

The app will be available at `https://baldertencate.github.io/farsi/`.
