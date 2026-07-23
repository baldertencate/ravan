# Ravân: Learn to Read Farsi

A mobile-first progressive web app for learning to read Persian through adaptive multiple-choice practice.

The public landing page explains how Ravân complements other Farsi-learning methods. The
installable practice app lives separately at `/app/`.

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
- Uses privacy-conscious, aggregate Plausible events for product improvement; answer content,
  reminder times, learning progress, and personal identifiers are never sent

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

The landing page will be available at `https://baldertencate.github.io/ravan/`, with the
practice app at `https://baldertencate.github.io/ravan/app/`.

## Analytics

When Plausible is connected, production builds send a small set of explicit events such as practice
starts, correct or incorrect answers, completed sets, installs, reminders, and level changes. Events
contain only coarse context such as exercise type, level, and response-time range.

Add `baldertencate.github.io` as a site in Plausible, copy its site-specific script URL, and save that
URL as the GitHub Actions repository variable `PLAUSIBLE_SCRIPT_SRC`. Local builds do not load
analytics unless `VITE_PLAUSIBLE_SCRIPT_SRC` is set.
