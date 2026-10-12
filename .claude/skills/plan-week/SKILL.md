---
name: plan-week
description: Plan the coming week for the Frame Dashboard — talk through priorities, write the week's plan JSON (focus + tasks per day) and push it to the live dashboard. Use when the user says "plan my week", "Monday planning", "update today's tasks", or "mark X done".
---

# Plan the week

The dashboard shows, for each day: a **focus** line, a short **task** list, and
the day's meetings. Meetings come from the calendar feeds automatically — never
copy them into the plan. Your job is the focus and the tasks.

## 1. Gather context

- Today's date and the Monday of the week (`weekOf`). Plan the current week if
  it is Monday–Wednesday, otherwise ask whether they mean this week or next.
- The current plan, if one exists:
  ```bash
  curl -s -H "Authorization: Bearer $DASHBOARD_WRITE_KEY" "$DASHBOARD_API/api/plan?week=<weekOf>"
  ```
  (Load `.env.local` first: `set -a; . ./.env.local; set +a`.)
- The week's meetings, so tasks land on days that have room. Use the Google
  Calendar connector if it is available, or `GET /api/week?date=<weekOf>`.
- Last week's plan — unfinished tasks are candidates to carry over. Ask; don't
  carry silently.

## 2. Talk it through

Ask what matters this week, then propose a plan. Keep it honest:

- **One focus per day**, written as an outcome ("Landing page copy done"), not
  an activity. ≤ 60 characters — it is set in large type.
- **3–5 tasks per day.** The screen shows five; more than that is a list nobody
  finishes. Heavy meeting days get fewer.
- Tasks ≤ 45 characters, verb first. Optional `tag` (one word: client, area).
- Leave the weekend empty unless they ask.

Show the proposal as a compact table and wait for a yes before pushing.

## 3. Write and push

Write `plan/<weekOf>.json` (gitignored — it is personal):

```json
{
  "weekOf": "2026-10-12",
  "focus": "Week theme, optional",
  "days": {
    "2026-10-12": {
      "focus": "Landing page copy done",
      "tasks": [
        { "text": "Write hero and pricing copy", "tag": "Site" },
        "Plain strings work too",
        { "text": "Already finished", "done": true }
      ]
    }
  }
}
```

Then:

```bash
npm run plan:push -- plan/<weekOf>.json
```

The server validates the shape (Monday `weekOf`, dates inside that week, ≤ 20
tasks a day) and answers 400 with the reason if anything is off. The TV picks
the change up within five minutes.

## Mid-week updates

Day-to-day edits usually happen in the Frame Desk menu bar app (add, tick,
remove). It writes the same plan document, so **always fetch the current plan
before changing it**. A local file can be stale by hours. Meetings pushed by
the app live in a separate document (`/api/events`); never copy them into the
plan.


"Mark X done", "move Y to Thursday", "add Z today": fetch the current plan
(step 1), edit it, push it. The whole week is replaced on every push, so always
start from what the server has, not from a stale local file.
