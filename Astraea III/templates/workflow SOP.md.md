---
type: workflow
tags:
  - workflow
  - system/sop
date_created: {{date}}
---

# ⚙️ Workflow SOP: {{title}}

> **Purpose:** Standard Operating Procedure for vault maintenance or technical operations.

---

## 🎯 Target Outcome
Clear description of what running this procedure accomplishes (e.g., Git backup, inbox clearance).

---

## 🔢 Step-by-Step SOP

### Step 1: Preparation
1. Ensure all open notes are saved.
2. Check network connectivity or system scripts.

### Step 2: Execution
1. Run terminal command or execute Obsidian plugin sequence:
   ```bash
   git add .
   git commit -m "vault backup: {{date}}"
   git push origin main