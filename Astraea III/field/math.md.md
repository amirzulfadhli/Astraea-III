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
