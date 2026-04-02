---
description: Start the development server
---

# Dev Server Workflow

// turbo-all

1. Kill any existing process on port 3000 and start the dev server:
```bash
kill $(lsof -t -i:3000) 2>/dev/null; sleep 1 && npm run start
```