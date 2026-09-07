---
type: workflow
title: Astraea III Vault Architecture & Folder Lifecycle Guide
system: Astraea III
tags:
  - workflow
  - system/architecture
  - topic/pkm
date_created: 2026-08-25
---



```
---
type: workflow
title: Astraea III Vault Architecture & Folder Lifecycle Guide
system: Astraea III
tags:
  - workflow
  - system/architecture
  - topic/pkm
date_created: 2026-08-25
---

# 🌌 Astraea III // Vault Architecture & Information Flow

> **System Purpose:** A production-grade, privacy-first knowledge operating system for Pure Sciences, Computer Science, Mathematics, and Logic. It leverages a local-first, file-over-app paradigm, Map of Content (MOC) dashboards, and AI sandboxing.

---

## 🔄 1. High-Level Lifecycle Diagram

```

[ 📥 CAPTURE ] [ ⚙️ REFINE ] [ 🔬 INDEX ] [ 🚀 APPLY ]

┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐

│ note/fleet/ ├────────►│ note/atomic/ ├───────►│ field/ ├──────►│ project/ │

│ (Raw Notes) │ │ (Evergreen) │ │ (MOC Hubs) │ │(PRJ-01, etc.)│

└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

note/lit/ AIOS Sandbox cs.md, math.md Code & Repos

(Books/Docs) (Isolated) logic.md, etc.

  

```

---

## 🗂 2. Detailed Stage-by-Stage Folder Flow

### Stage 1: Capture Phase (Raw Input)
* **Target Directories:** `note/fleet/` & `note/lit/`
* **Purpose:** High-velocity, unfiltered data intake.
* **Operational SOP:**
  * Dump quick thoughts, lecture screenshots, and unformatted class notes into `note/fleet/`.
  * Store textbook chapter notes, paper summaries, and external documentation in `note/lit/`.
  * **Rule:** Do not attempt to structure or hyper-link notes at this stage. Keep capture speed friction-free.

---

### Stage 2: Refinement Phase (Atomic Conversion & AI Sandboxing)
* **Target Directory:** `note/atomic/`
* **Purpose:** Transforming raw data into modular, single-concept evergreen notes.
* **Operational SOP:**
  * Extract discrete principles (e.g., `Time Complexity.md`, `Predicate Logic.md`) into individual notes inside `note/atomic/`.
  * **AI Isolation Chamber:** If using external AI tools to assist in note generation or synthesis, operate within an isolated folder (e.g., `AIOS/` or a temporary sandbox). Only transfer human-reviewed, polished notes into `note/atomic/` to eliminate cognitive debt.
  * Every atomic note must include YAML frontmatter, formal mathematical definitions (LaTeX), and bilateral WikiLinks.

---

### Stage 3: Indexing Phase (Field Dashboards & MOCs)
* **Target Directory:** `field/` (`cs.md`, `math.md`, `logic.md`, `science.md`)
* **Purpose:** Providing structural signal, topic hierarchy, and high-density hubs.
* **Operational SOP:**
  * Maps of Content (MOCs) act as clean air-traffic controllers. They do not store long-form lecture text.
  * When a new atomic note is created in `note/atomic/`, add its WikiLink `[[Concept Name]]` under the appropriate domain category in its respective `field/` file.
  * *Example:* Add `* [[Time Complexity]]` under the **Algorithms** section inside `field/cs.md`.

---

### Stage 4: Application Phase (Project Execution)
* **Target Directory:** `project/` (`PRJ-01.md`, `PRJ-02.md`, etc.)
* **Purpose:** Executing multi-stage initiatives, development repositories, and research papers.
* **Operational SOP:**
  * Each project file contains active task checklists, technical specifications, and links pointing back to relevant atomic notes in `note/atomic/`.
  * *Example:* `PRJ-01.md` references theoretical concepts `[[Machine Learning]]` and `[[Linear Regression]]`.

---

### System Operations Layer
* **Target Directory:** `workflow/` (`index.md`, backup SOPs)
* **Purpose:** Operating procedures that maintain vault integrity without mixing system maintenance with academic content.

---

## 🛡 3. The Three-Layer AI & Ownership Architecture

To maintain **digital data sovereignty** and prevent AI lock-in, Astraea III enforces a strict three-layer operational model:

```

┌─────────────────────────────────────────────────────────┐

│ 01. Core Knowledge Base │

│ (Local Markdown Files owned by the user) │

└────────────────────────────┬────────────────────────────┘

│

┌────────────────────────────▼────────────────────────────┐

│ 02. Translation Layer │

│ (Vault Prompts, Templates, Rules, Style Manuals) │

└────────────────────────────┬────────────────────────────┘

   │

┌────────────────────────────▼────────────────────────────┐

│ 03. AI Model Layer │

│ (Interchangeable Engines: Claude, ChatGPT, Gemini) │

└─────────────────────────────────────────────────────────┘

````

1. **Core Knowledge Base (Layer 1):** Your local `.md` files in `note/`, `field/`, and `project/`. This is your immutable second brain.
2. **Translation Layer (Layer 2):** Markdown templates and system instructions stored in `templates/` that teach AI models how to format notes specifically for Astraea III.
3. **AI Model Layer (Layer 3):** Disposable external LLMs. Swap models at will without disturbing Layer 1 or Layer 2.

---

## 📊 4. Directory Structure Reference Summary

```text
📁 Astraea III (Vault Root)
├── 📄 index.md                          <-- Central Hub Dashboard
├── 📁 field                             <-- Stage 3: Maps of Content (MOCs)
│   ├── cs.md                            <-- Computer Science Index
│   ├── logic.md                         <-- Formal Logic Index
│   ├── math.md                          <-- Mathematics Index
│   └── science.md                       <-- Pure Sciences Index
├── 📁 note                              <-- Stage 1 & 2: Note Processing Pipeline
│   ├── 📁 atomic                        <-- Modular Evergreen Concepts
│   ├── 📁 fleet                         <-- Raw Lecture Snippets (Inbox)
│   └── 📁 lit                           <-- Literature & Textbook Summaries
├── 📁 project                           <-- Stage 4: Active Projects
│   ├── PRJ-01.md
│   └── PRJ-02.md
├── 📁 templates                         <-- Translation Layer Prompts & Rules
└── 📁 workflow                          <-- Vault Ops & SOPs
    └── index.md
````

```

<ElicitationsGroup message="Suggested next steps for your vault setup:">

<Elicitation label="Generate a Git backup automation workflow script" query="Write a step-by-step workflow guide and script to automatically back up my Obsidian vault Astraea III to GitHub."/>

<Elicitation label="Create a Dataview dashboard for unlinked atomic notes" query="Write Dataview queries to find orphan atomic notes in my Obsidian vault that are not linked to any Field MOC."/>

<ElicitationsGroup>
```