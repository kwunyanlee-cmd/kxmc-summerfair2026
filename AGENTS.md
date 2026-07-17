# KXMC Summer Fair 2026

This is a static public site. Production is linked from the repository homepage:
https://kxmc-summerfair2026.vercel.app

## Raffle Results Update

The raffle section lives in the root `index.html`. The `summerfair-netlify/`
folder is a legacy export and does not contain the current raffle section.

Use the helper script where possible:

```powershell
node scripts/update-raffle-results.mjs results.json
```

Use strings for ticket numbers so leading zeroes are preserved.

Example:

```json
{
  "2pm": {
    "status": "drawn",
    "prizes": {
      "1": ["045", "178"],
      "2": ["234", "567"],
      "4": ["101", "102", "103", "104", "105"]
    }
  },
  "330pm": {
    "9": ["301", "302"]
  }
}
```

Accepted draw keys: `2pm`, `draw2pm`, `330pm`, `3:30pm`, `3.30pm`,
and `draw330pm`.

Each prize row already has one chip per expected winner:

- 2pm: prizes 1-11.
- 3:30pm: prizes 1-12.
- Prize 1 in both draws has two winners.
- Prize 4 in both draws has five winners.
- Prize 9 has one winner at 2pm and two winners at 3:30pm.

If a row has more winning numbers than existing chips, the script adds extra
chips rather than failing.

## Deploy

1. Pull latest `main`.
2. Update root `index.html`.
3. Check `git diff` and, if useful, open the static page locally.
4. Commit and push directly to `main`:

```powershell
git add index.html
git commit -m "Update raffle results"
git push origin main
```

There are no GitHub Actions in this repo. Vercel auto-deploys from GitHub after
the push to `main`. Confirm the live page after a short wait:

```powershell
$r = Invoke-WebRequest -Uri "https://kxmc-summerfair2026.vercel.app" -UseBasicParsing
$r.StatusCode
```
