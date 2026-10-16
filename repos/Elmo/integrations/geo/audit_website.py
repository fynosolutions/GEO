"""Bounded restaurant website preparation. No browser, credentials or model calls."""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
import re
import sys
from urllib.parse import urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup
from collect import extract_fields, page_content, restaurant_nodes
from geo_optimizer.utils.http import fetch_url


def origin(url):
    parsed = urlsplit(url)
    return parsed.scheme.lower(), parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)


def same_origin(left, right):
    try:
        return origin(left) == origin(right)
    except ValueError:
        return False


def stage(status, **values):
    return {"status": status, **values}


def read_page(url, fetch=fetch_url):
    response, error = fetch(url, timeout=10, max_size=2_000_000)
    if response is None:
        return None, str(error or "fetch_failed")[:500]
    if response.status_code not in (200, 203):
        return None, f"HTTP {response.status_code}"
    if not any(kind in response.headers.get("content-type", "").lower() for kind in ("text/html", "application/xhtml")):
        return None, "unsupported_content_type"
    try:
        html = response.content.decode("utf-8")
    except UnicodeDecodeError:
        html = response.text
    return {"url": response.url, "html": html, "response": response}, None


def candidate(node, source_url):
    address = node.get("address", {})
    result = {"website": source_url, "provenance": "website_observed"}
    for key, source in (("name", "name"), ("cuisine", "servesCuisine")):
        if isinstance(node.get(source), str):
            result[key] = node[source][:500]
    if isinstance(address, dict):
        for key, source in (("address", "streetAddress"), ("city", "addressLocality"), ("state", "addressRegion"), ("postalCode", "postalCode")):
            if isinstance(address.get(source), str):
                result[key] = address[source][:500]
    elif isinstance(address, str):
        result["address"] = address[:500]
    return result


def technical_audit(page, fetch=fetch_url):
    # Only pure, already-fetched GEO Optimizer checks run here. Full audit also
    # performs CDN probes and plugins outside this public endpoint's page bound.
    from geo_optimizer.core.audit import (
        _audit_robots_from_response, _audit_llms_from_response,
        audit_schema, audit_meta_tags, audit_content_quality, audit_signals,
        audit_brand_entity, compute_geo_score, compute_score_breakdown,
    )
    from geo_optimizer.models.results import AiDiscoveryResult, NegativeSignalsResult
    soup = BeautifulSoup(page["html"], "html.parser")
    robots_response, _ = fetch(urljoin(page["url"], "/robots.txt"), timeout=6, max_size=500_000)
    llms_url = urljoin(page["url"], "/llms.txt")
    llms_response, _ = fetch(llms_url, timeout=6, max_size=500_000)
    robots = _audit_robots_from_response(robots_response)
    llms = _audit_llms_from_response(llms_response, url=llms_url)
    schema = audit_schema(soup, page["url"])
    meta = audit_meta_tags(soup, page["url"])
    content = audit_content_quality(soup, page["url"])
    signals = audit_signals(soup, schema)
    brand = audit_brand_entity(soup, schema, meta, content)
    discovery, negative = AiDiscoveryResult(), NegativeSignalsResult()
    args = (robots, llms, schema, meta, content, signals, discovery, brand, negative)
    findings = []
    checks = [
        ("title", bool(meta.has_title), "Add a descriptive page title", "Use a page title that identifies the restaurant and location."),
        ("description", bool(meta.has_description), "Add a useful meta description", "Describe the restaurant, cuisine and location accurately."),
        ("canonical", bool(meta.has_canonical), "Set a canonical page URL", "Identify the preferred URL for this page."),
        ("restaurant_schema", any(node.get("@type") == "Restaurant" or "Restaurant" in node.get("@type", []) for node in restaurant_nodes(page["html"])), "Publish restaurant structured data", "Include accurate Restaurant JSON-LD for each location; verify address and contact details."),
        ("llms", bool(llms.found), "Consider an llms.txt index", "This optional organizational signal is not a proven AI ranking factor."),
    ]
    for key, passed, title, detail in checks:
        if not passed:
            findings.append({"id": f"website:{key}", "title": title, "detail": detail, "priority": "low" if key == "llms" else "medium", "evidenceIds": [page["evidenceId"]]})
    return stage("succeeded", score=compute_geo_score(*args), findings=findings, data={
        "engine": "GEO Optimizer", "profile": "restaurant-bounded.v1",
        "scoreBreakdown": compute_score_breakdown(*args),
        "checks": {"robots": asdict(robots), "llms": asdict(llms), "schema": asdict(schema), "meta": asdict(meta), "content": asdict(content)},
        "limitation": "Technical heuristic score using a bounded profile; not AI recommendation probability. AI discovery endpoints, CDN probes and plugins were not checked.",
    })


def audit_website(request, fetch=fetch_url, run_technical=technical_audit):
    url = request["url"]
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Provide an HTTP(S) website without credentials")
    now = datetime.now(timezone.utc).isoformat()
    result = {"pageFetch": stage("failed"), "businessExtraction": stage("not_started"), "websiteAudit": stage("not_started"), "actionChecks": [], "evidenceRefs": [], "candidates": []}
    home, error = read_page(url, fetch)
    if home is None:
        result["pageFetch"] = stage("failed", error=error)
        result["websiteAudit"] = stage("failed", error="Website could not be read; no technical score inferred", score=None)
        return {"website": result, "evidence": [], "pages": []}
    pages, evidence, failed = [], [], []
    pending = [home]
    seen = {urlunsplit(urlsplit(home["url"])._replace(fragment=""))}
    while pending and len(pages) < (1 if request.get("mode") == "excerpt" else 5):
        page = pending.pop(0)
        html = page["html"]
        digest = hashlib.sha256(html.encode()).hexdigest()
        page["evidenceId"] = f"website:{digest[:24]}"
        pages.append(page)
        result["evidenceRefs"].append({"id": page["evidenceId"], "sha256": digest, "sourceUrl": page["url"], "bytes": len(html.encode()), "collectedAt": now})
        evidence.append({"id": page["evidenceId"], "body": html, "mediaType": "text/html"})
        if len(pages) != 1 or request.get("mode") == "excerpt":
            continue
        links = page_content(html, page["url"])["links"]
        links.sort(key=lambda link: (0 if re.search(r"location|menu|contact|about", link["url"] + " " + link["title"], re.I) else 1, link["url"]))
        for link in links:
            target = urlunsplit(urlsplit(link["url"])._replace(fragment=""))
            if target in seen or not same_origin(target, home["url"]):
                continue
            seen.add(target)
            if len(seen) > 5:
                break
            fetched, fetch_error = read_page(target, fetch)
            if fetched is None:
                failed.append({"url": target, "error": fetch_error})
            elif not same_origin(fetched["url"], home["url"]):
                failed.append({"url": target, "error": "Cross-origin redirect excluded from website pages"})
            else:
                pending.append(fetched)
    for page in pages:
        nodes = restaurant_nodes(page["html"])
        for node in nodes:
            item = candidate(node, page["url"])
            signature = lambda value: tuple(str(value.get(key, "")).lower().strip() for key in ("name", "address", "city", "state"))
            if not any(signature(existing) == signature(item) for existing in result["candidates"]):
                result["candidates"].append(item)
        fields, content, _ = extract_fields(page["html"], page["url"], page["evidenceId"])
        if not nodes and fields.get("name") and not result["candidates"]:
            result["candidates"].append({"name": fields["name"]["value"], "website": url, "provenance": "website_observed"})
        for key in ("menuUrl", "reservationUrl", "orderUrl"):
            target = fields.get(key, {}).get("value")
            if not target:
                pattern = {"menuUrl": r"^menu$", "reservationUrl": r"reserv|book a table", "orderUrl": r"online order|order online|order now"}[key]
                targets = {link["url"] for link in content["links"] if re.search(pattern, link["title"], re.I)}
                if len(targets) == 1:
                    target = targets.pop()
            if isinstance(target, str) and target.startswith(("https://", "http://")):
                result["actionChecks"].append({"id": f"{key}:{len(result['actionChecks'])}", "kind": key, "status": "found", "url": target, "evidenceIds": [page["evidenceId"]]})
    result["candidates"] = result["candidates"][:30]
    for key in ("menuUrl", "reservationUrl", "orderUrl"):
        if not any(check["kind"] == key for check in result["actionChecks"]):
            result["actionChecks"].append({"id": key, "kind": key, "status": "unknown", "evidenceIds": []})
    result["pageFetch"] = stage("succeeded", data={"pages": [{"url": page["url"], "evidenceId": page["evidenceId"]} for page in pages], "failedPages": failed})
    result["businessExtraction"] = stage("succeeded" if result["candidates"] else "unknown", data={"provenance": "website_observed", "requiresLocationConfirmation": True})
    if request.get("mode") != "excerpt":
        try:
            result["websiteAudit"] = run_technical(home, fetch)
        except Exception as exc:
            result["websiteAudit"] = stage("failed", error=str(exc)[:500], score=None)
    return {"website": result, "evidence": evidence, "pages": [{"url": page["url"], "html": page["html"]} for page in pages]}


if __name__ == "__main__":
    try:
        payload = json.loads(sys.stdin.read(20000))
        print(json.dumps(audit_website(payload), ensure_ascii=False, default=str))
    except Exception as exc:
        print(json.dumps({"error": str(exc)[:500]}))
        sys.exit(1)
