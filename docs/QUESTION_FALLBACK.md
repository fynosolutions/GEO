# Independent search question fallback

Enabled by default; set `QUESTION_FALLBACK=false` to disable. After the existing
search, browser and image paths return no non-null fields, each platform gets at
most one fresh conversational search request and one structured extraction
request. This adds latency and API usage only when triggered. It shares the audit
cancel signal and retains existing browser diagnostics.

The search prompt asks how the exact branch is reviewed on the specified platform,
without supplying the previous access failures. It uses Responses `web_search`
with `tool_choice: required`, no prior response ID and no previous conversation.
This is a separate retrieval attempt, not a way to open the ChatGPT consumer UI
or to reproduce its restaurant card backend.

The raw search response is saved as `<platform>.question.research.json`, the
verified candidate as `<platform>.question.json`, and accepted fields merge into
the existing `<platform>.json` for the comparison table. Only original values
with matching-platform listing citations and evidence excerpts are accepted;
only review themes may be summarized. All evidence from this path is conservatively
labeled `search_excerpt`, with a possible-staleness note. A model answer and
citation are not independent proof of the excerpt's freshness or correctness.
Unknown fields stay null. If the API fails, existing results are preserved.

Documentation: https://developers.openai.com/api/docs/guides/tools-web-search
