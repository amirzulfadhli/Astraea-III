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
