
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
