# Ravân — Google Play release notes

## App identity

- **App name:** Ravân: Learn to Read Farsi
- **Package ID:** `com.baldertencate.ravan`
- **App type:** App
- **Category:** Education
- **Price:** Free
- **Default language:** English (United States)
- **Support email:** balder.tencate@gmail.com
- **Website:** https://baldertencate.github.io/ravan/
- **Privacy policy:** https://baldertencate.github.io/ravan/privacy/

The package ID is permanent once the first bundle is uploaded. Do not reuse it for another app.

## Store listing draft

### Short description

Adaptive exercises for learning to read Persian words and short phrases.

### Full description

Learn to recognize and read Persian script through short, focused exercises.

Ravân helps you connect written Farsi first to pronunciation and then to meaning. Practice starts with short, common words and gradually introduces longer vocabulary, useful visual patterns, verb forms, and short phrases.

Your practice adapts as you learn. Words and patterns that need more attention return more often, while flower stages make progress visible across six levels.

Features:

- Multiple-choice reading exercises
- Pronunciation practice that gradually gives way to meaning
- Common Persian word patterns in isolation and context
- A complete alphabet reference with contextual letter forms
- Local reminders at the frequency and time you choose
- Progress, mastery, streaks, accuracy, and speed tracking
- No account required
- Progress stored locally on your device
- No advertisements

Ravân complements courses, tutors, textbooks, and language apps with interactive practice designed specifically for learning to read Farsi.

## Play Console declarations

These answers describe the initial native Android build. Recheck them whenever features or third-party services change.

- **Contains ads:** No
- **App access:** All functionality is available without login or special access
- **Data collection:** No data is transmitted by the Android app to the author or an analytics provider
- **Data sharing:** None
- **Account creation:** None
- **Location:** Not collected
- **Advertising ID:** Not used
- **Financial features:** None; the optional external contribution grants no content or benefit
- **Permissions:** Notifications are requested only after the user enables reminders

The Data safety form must still be completed even when the answer is that no user data is collected or shared.

## Testing path for a new personal account

1. Upload the first Android App Bundle to Internal testing.
2. Verify installation, reminders, haptics, sharing, external links, offline startup, and progress persistence on physical Android phones.
3. Create a Closed testing track and recruit at least 12 Google-account testers.
4. Keep at least 12 testers continuously opted in for 14 days. Recruit 15–18 people to allow for dropouts.
5. Collect feedback and publish corrected bundles to the same closed track when needed.
6. Apply for Production access from the Play Console dashboard.
7. After approval, create and roll out the Production release.

## Release checklist

- [ ] Play Console developer account verified
- [ ] Android SDK license accepted and API 36 installed
- [ ] Debug build tested on a physical Android phone
- [ ] Native reminders tested after reboot and after changing time zone
- [ ] Haptics tested on correct and incorrect answers and flower milestones
- [ ] App icon and splash screen visually checked
- [ ] 512 × 512 Play Store icon exported
- [ ] 1024 × 500 feature graphic created
- [ ] At least four 1080 × 1920 phone screenshots created
- [ ] Privacy policy published
- [ ] App content, content rating, target audience, and Data safety forms completed
- [ ] Upload key generated and backed up outside the repository
- [ ] Signed Android App Bundle generated
- [ ] Internal test completed
- [ ] Closed test completed with at least 12 testers for 14 continuous days
- [ ] Production access approved
