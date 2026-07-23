# Ravân: Learn to Read Farsi

A mobile-first progressive web app for learning to read Persian through adaptive multiple-choice practice.

## What it does

- Builds from short, frequent letter patterns toward longer everyday words
- Uses spaced repetition: misses return quickly; successful words wait longer
- Introduces English-meaning questions only after that word has first been matched to its transliteration correctly; a missed meaning relocks the word until its pronunciation is answered correctly again
- Teaches recurring visual chunks such as `می‌ـ`, `نمی‌ـ`, plural `ـها`, and common verb endings through scored questions—first in isolation, then highlighted inside real words
- Tracks accuracy, answer speed, daily streaks, and per-word progress locally
- Introduces the method through a focused first-run onboarding
- Installs to a phone Home Screen with dedicated app icons and full-screen presentation
- Offers recurring calendar reminders without requiring an account or notification server
- Uses gentle answer haptics on supported Android devices
- Includes an About and Settings area for installation, reminders, sharing, vowel marks, haptics, privacy, and replaying onboarding
- Works offline after the first visit

## Native preparation

The intended first native release keeps the existing React learning experience and adds optional scheduled notifications—configured by time of day and an every-X-days cadence—plus simple haptics. Audio, payments, cloud sync, widgets, and deeper native integrations are intentionally deferred.

## Word data

The starter set lives at `src/data/words.json`. Each entry has a stable `id`, Persian spelling, transliteration, English meaning, difficulty level, frequency rank, and letter list. The current 121-word set includes every Persian letter in at least two quiz words. Optional pedagogical vowel forms are keyed by the same IDs in `src/data/vowels.json`; words without an entry safely fall back to their standard spelling. Replace or extend these files to scale toward 500+ words.

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
