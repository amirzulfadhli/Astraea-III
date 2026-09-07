---
type: root-index
system: Astraea III
date_created: 2026-08-25
---

# 🌌 Astraea III // Central Hub

> **System Status:** Active  
> **Architecture:** PARA / Zettelkasten Hybrid  
> **Core Focus:** Pure Sciences · Computer Science · Mathematics · Formal Logic

---

## 🗂 System Navigation

### 🚀 Projects (`#project`)
*Track high-level initiatives, development repos, and multi-stage research.*

| Code | Project | Domain | Status |
| :--- | :--- | :--- | :---: |
| `PRJ-01` | [[PRJ-01.md]] | Software / ML | 🟡 `In Progress` |
| `PRJ-02` | [[PRJ-02.md]] | Math / Logic | 🟢 `Active` |
| `PRJ-03` | [[PRJ-03.md]] | Vault Automation | ⚪ `Planning` |

---

### 🔬 Knowledge Fields (`#field`)
* **Computer Science:** [[cs|CS Dashboard]] — Algorithms, AI/ML, Networks, Systems
* **Mathematics:** [[math|Math Dashboard]] — Calculus, Linear Algebra, Discrete, Stats
* **Formal Logic:** [[logic|Logic Dashboard]] — Propositional, Predicate, Automata
* **Pure Sciences:** [[science|Science Dashboard]] — Physics, Information Theory

---

### 📝 Notes Pipeline (`#note`)
- **Inbox / Fleet Notes:** `note/fleet/` — Quick lecture captures and raw material.
- **Literature Notes:** `note/lit/` — Summaries from papers, docs, and textbooks.
- **Atomic Notes:** `note/atomic/` — Modular, evergreen, interconnected concepts.

---

### ⚙️ Workflows (`#workflow`)
- [[workflow/index|Workflows Index]] — SOPs for vault backup, spaced repetition, and study habits.

---

## 📊 Vault Statistics & Recent Activity
```dataview
TABLE file.mtime AS "Last Modified", tags AS "Tags"
FROM ""
WHERE file.name != "index"
SORT file.mtime DESC
LIMIT 5

````
---

### 2. Field Dashboards (`field/`)

#### 💻 Computer Science (`field/cs.md`)
```markdown
---
type: moc
field: Computer Science
tags:
  - field/cs
---

# 💻 Field: Computer Science

> **Domain Scope:** Computation theory, algorithm design, software architecture, and artificial intelligence systems.

---

## 📌 Topic Maps & Sub-Domains
* **Core Systems:** [[Operating Systems]] · [[Computer Architecture]] · [[Computer Networks]]
* **Algorithms & Data Structures:** [[Time Complexity]] · [[Data Structures]] · [[Sorting Algorithms]]
* **AI & Data Science:** [[Machine Learning]] · [[Deep Learning]] · [[Predictive Modeling]]
* **Systems Development:** [[Web Architectures]] · [[Internet of Things]]

---

## 📊 Index of CS Notes
```dataview
TABLE tags AS "Tags", file.folder AS "Folder"
FROM #field/cs
WHERE file.name != "cs"
SORT file.name ASC
````

---
#### 📐 Mathematics (`field/math.md`)
```markdown
---
type: moc
field: Mathematics
tags:
  - field/math
---

# 📐 Field: Mathematics

> **Domain Scope:** Continuous and discrete mathematical foundations, optimization, and probability.

---

## 📌 Topic Maps & Sub-Domains
* **Continuous Mathematics:** [[Linear Algebra]] · [[Multivariable Calculus]] · [[Differential Equations]]
* **Discrete & Applied:** [[Discrete Mathematics]] · [[Probability & Statistics]] · [[Graph Theory]]
* **Optimization:** [[Convex Optimization]] · [[Numerical Analysis]]

---

## 📊 Index of Math Notes
```dataview
TABLE tags AS "Tags", file.folder AS "Folder"
FROM #field/math
WHERE file.name != "math"
SORT file.name ASC
````


---

#### 🧠 Formal Logic (`field/logic.md`)
```markdown
---
type: moc
field: Formal Logic
tags:
  - field/logic
---

# 🧠 Field: Formal Logic

> **Domain Scope:** Propositional logic, predicate calculus, formal proof systems, and computability theory.

---

## 📌 Topic Maps & Sub-Domains
* **Formal Systems:** [[Propositional Logic]] · [[Predicate Calculus]] · [[Boolean Algebra]]
* **Computation Theory:** [[Automata Theory]] · [[Computability & Complexity]] · [[Turing Machines]]
* **Proofs:** [[Mathematical Proofs]] · [[Inductive Reasoning]]

---

## 📊 Index of Logic Notes
```dataview
TABLE tags AS "Tags", file.folder AS "Folder"
FROM #field/logic
WHERE file.name != "logic"
SORT file.name ASC
````


---
#### 🧪 Pure Sciences (`field/science.md`)
```markdown
---
type: moc
field: Pure Science
tags:
  - field/science
---

# 🧪 Field: Pure Sciences

> **Domain Scope:** Physics, physical systems modeling, and theoretical information sciences.

---

## 📌 Topic Maps & Sub-Domains
* **Physics:** [[Classical Mechanics]] · [[Electromagnetism]] · [[Quantum Mechanics]]
* **Interdisciplinary:** [[Computational Physics]] · [[Information Theory]]

---

## 📊 Index of Science Notes
```dataview
TABLE tags AS "Tags", file.folder AS "Folder"
FROM #field/science
WHERE file.name != "science"
SORT file.name ASC
````

---

### 3. Note Types (`note/`)

#### 📥 Fleet Note Template (`note/fleet/`)
```markdown
---
type: fleet
status: raw
tags:
  - note/fleet
date_created: 2026-08-25
---

# 📥 Lecture Snippet: [Topic Name]

> **Context:** [Course Code / Lecture Name / Source]

---

## 📝 Raw Capture
- Point 1 from lecture
- Point 2 from lecture

---

## 🔄 Triage Tasks
- [ ] Refine into Atomic Notes
- [ ] Link to parent Field Dashboard
````

---
````
type: project
project_code: PRJ-01
status: in-progress
tags:
  - project
date_started: 2026-08-25
---

# 🚀 PRJ-01: [Project Title]

> **Objective:** Clear definition of the project outcome.

---

## 📋 Task Breakdown
- [/] **Phase 1: Setup**
  - [x] Initial design & requirements
  - [ ] Implementation
- [ ] **Phase 2: Deployment**
  - [ ] Review & testing

---

## 📚 Related Vault Notes
* [[cs]]
* [[Relevant Concept Note]]
````