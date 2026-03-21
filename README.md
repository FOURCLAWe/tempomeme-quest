# Tempomeme Quest

A landing page and submission form for the Tempomeme X quest.

## Features

- Tempomeme branded landing page with custom logo and favicon
- EVM wallet submission form with client-side validation
- Quest checklist for follow, comment, like, and repost actions
- Node.js endpoint that stores submissions locally in `data/survey-submissions.ndjson`

## Run locally

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Submission storage

Form submissions are written to:

```text
data/survey-submissions.ndjson
```

This file is ignored by git.

## Optional environment variables

The current quest site does not require environment variables for the survey flow.
This repo still includes the legacy `/api/chat` endpoint from the original starter, so
you only need a `.env` file if you plan to use that endpoint as well.

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
PORT=3000
```
