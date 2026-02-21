# Runtime Error Notes

This document tracks high-impact runtime failures observed during live runs and how Elisa handles them.

## `OUTPUT_LIMIT_REACHED`

- Symptom: task retries repeatedly, then human gate appears with:
  - `OUTPUT_LIMIT_REACHED: Response exceeded max completion tokens`
  - or API text like `max_tokens or model output limit was reached`.
- Cause: model hits completion/output limit before finishing the response.
- Current handling:
  - Detect and classify as `OUTPUT_LIMIT_REACHED` in `agentRunner`.
  - Retry with:
    - compact prompt mode,
    - explicit short-response constraints,
    - increased completion token budget.
  - Switch to fallback model (`OPENAI_FALLBACK_MODEL`, default `gpt-4.1`) on retry.
  - After first output-limit event in a run, subsequent tasks start on fallback model.

## `CONTEXT_WINDOW_EXCEEDED`

- Symptom: API/context overflow errors such as `too many tokens` or `context length`.
- Cause: prompt payload exceeds model context window.
- Current handling:
  - Detect and classify as `CONTEXT_WINDOW_EXCEEDED` in `agentRunner`.
  - Retry in compact context mode (skips heavy manifest/digest blocks).

## Notes For Instructors

- These error handlers are designed to keep students focused on spec/intent iteration.
- Retry behavior should recover automatically without forcing students to re-spec the project.
