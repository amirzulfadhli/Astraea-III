# PR #1 review

Reviewed head `71d87e95602cb163d633075436969b3549ac5d25` on 2026-11-04. PR #1 remains draft and unmerged.

Two high-priority confidentiality issues were found and fixed:

- The provider usage object was copied wholesale into step state and audit records. Unknown keys could carry raw credentials or content. Only validated numeric token/cost fields are now retained.
- The provider could throw a CoreError with an arbitrary code, bypassing the intended provider-error redaction. Provider promise failures now normalize to PROVIDER_FAILURE before entering the engine error handler.

Both have regression tests. The portable cloud suite passes 81 tests (79 original plus 2 new). Node 22/24 CI remains the native execution check. No write adapter, provider SDK, scheduler or vault mutation has been enabled.

The rest of the review confirms the documented v0 limitations: process-local state/deduplication, no durable recovery, and policy-only Git integration. These are the focus of the separate stacked Core v0.2 branch.
