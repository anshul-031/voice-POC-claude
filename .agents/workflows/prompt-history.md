---
description: Maintain a file in the workspace to save user-provided prompts (not AI output)
---

# User Prompt History Workflow

Use this workflow to persist user-provided prompts for future reference.

## Rules

1. **Dedicated file** — maintain a `PROMPT_HISTORY.md` file at the
   workspace root to record user prompts.

2. **User prompts only** — save only the prompts provided by the user.
   Do NOT save AI-generated responses or conversations.

3. **Format** — append each prompt with a timestamp:
   ```markdown
   ## YYYY-MM-DD HH:MM

   <user prompt text>

   ---
   ```

4. **Gitignore** — add `PROMPT_HISTORY.md` to `.gitignore` to keep
   prompts private and out of version control.

## Steps

1. When a user provides a new prompt, append it to `PROMPT_HISTORY.md`
   at the workspace root.
2. Include the current date and time as a heading.
3. Separate entries with a horizontal rule (`---`).
4. Verify the file is listed in `.gitignore`.
