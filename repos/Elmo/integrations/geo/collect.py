"""One bounded, read-only collection. Input and output are JSON over stdio."""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
import re
import sys
from urllib.parse import urljoin, urlparse
import uuid

from bs4 import BeautifulSoup
from geo_optimizer.utils.http import fetch_url


def page_content(html, url):
    # Adapted from GEORank _crawl_page's text/title/link contract (Apache-2.0).
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for a in soup.select("a[href]"):
        target = urljoin(url, a.get("href", ""))
        if target.startswith(("https://", "http://")):
            links.append({"url": target, "title": (a.get_text(" ", strip=True) or a.get("aria-label") or a.get("title") or "").strip()})
        if len(links) == 80:
            break
    for node in soup.select("script, style, noscript"):
        node.decompose()
    return {"text": soup.get_text(" ", strip=True)[:50000], "title": soup.title.get_text(strip=True) if soup.title else "", "links": links, "url": url}


def restaurant_nodes(html):
    nodes = []
    def visit(value):
        if isinstance(value, list):
            for item in value:
                visit(item)
        elif isinstance(value, dict):
            kinds = value.get("@type", [])
            kinds = [kinds] if isinstance(kinds, str) else kinds
            if any(kind in ["Restaurant", "FoodEstablishment", "LocalBusiness"] for kind in kinds):
                nodes.append(value)
            for key in ["@graph", "mainEntity", "itemListElement", "item"]:
                if key in value:
                    visit(value[key])
    for script in BeautifulSoup(html, "html.parser").select('script[type="application/ld+json"]'):
        try:
            visit(json.loads(script.string or script.get_text()))
        except (ValueError, TypeError):
            continue
    return nodes


def extract_fields(html, url, evidence_id):
    content = page_content(html, url)
    text = content["text"]
    fields = {}
    def put(key, value, excerpt):
        if value is not None and value != "":
            fields[key] = {"state": "observed", "value": value, "evidenceIds": [evidence_id], "excerpt": str(excerpt)[:10000]}
    nodes = restaurant_nodes(html)
    if len(nodes) > 1:
        # Multiple branch entities must be selected by an operator, never last-write-wins.
        return {}, content, "multiple_restaurant_entities_require_review"
    node = nodes[0] if nodes else {}
    for key, source in [("name", "name"), ("phone", "telephone"), ("priceRange", "priceRange"), ("website", "url"), ("menuUrl", "hasMenu")]:
        value = node.get(source)
        if isinstance(value, str):
            put(key, value, json.dumps({source: value}, ensure_ascii=False))
    address = node.get("address")
    if isinstance(address, dict):
        value = ", ".join(str(address[key]) for key in ["streetAddress", "addressLocality", "addressRegion", "postalCode"] if address.get(key))
        put("address", value, json.dumps(address, ensure_ascii=False))
    elif isinstance(address, str):
        put("address", address, address)
    soup = BeautifulSoup(html, "html.parser")
    if "name" not in fields:
        heading = soup.find("h1")
        if heading and len(heading.get_text(strip=True)) < 200:
            put("name", heading.get_text(" ", strip=True), str(heading))
    for key, pattern in [("phone", r"Phone\s*:?\s*(\+?1?\s*\(?\d{3}\)?[ .-]*\d{3}[ .-]*\d{4})"), ("address", r"Address\s*:?\s*(\d+\s+[^\n]{2,80}?,\s*New York,?\s*NY\s*\d{5})")]:
        if key not in fields:
            found = re.search(pattern, text, re.I)
            if found:
                put(key, found.group(1).strip(), found.group(0))
    days = {name: str(i+1) for i, name in enumerate(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])}
    specs = node.get("openingHoursSpecification", [])
    specs = [specs] if isinstance(specs, dict) else specs
    by_day = {}
    for spec in specs if isinstance(specs, list) else []:
        if not isinstance(spec, dict) or spec.get("validFrom") or spec.get("validThrough"):
            continue
        opening, closing = spec.get("opens"), spec.get("closes")
        if not all(isinstance(time, str) and re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", time) for time in [opening, closing]):
            continue
        specified = spec.get("dayOfWeek", [])
        for day in [specified] if isinstance(specified, str) else specified:
            day = days.get(str(day).rsplit("/", 1)[-1])
            if day:
                by_day.setdefault(day, []).append({"open": opening, "close": closing, "closesNextDay": closing < opening})
    for day, periods in by_day.items():
        if any(item["open"] == item["close"] for item in periods):
            continue
        put("hours." + day, {"state": "open", "intervals": periods}, json.dumps(specs))
    def clock(value):
        match = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(AM|PM)", value.strip(), re.I)
        if not match or not 1 <= int(match[1]) <= 12 or int(match[2] or 0) > 59:
            return None
        return f"{int(match[1]) % 12 + (12 if match[3].upper() == 'PM' else 0):02}:{int(match[2] or 0):02}"
    hours = re.search(r"Mon\s*[-–]\s*Sun\s*:?\s*(\d{1,2}(?::\d{2})?\s*[AP]M)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*[AP]M)", text, re.I)
    if hours and not by_day:
        opening, closing = clock(hours[1]), clock(hours[2])
        if opening and closing and opening != closing:
            for day in range(1, 8):
                put(f"hours.{day}", {"state": "open", "intervals": [{"open": opening, "close": closing, "closesNextDay": closing < opening}]}, hours[0])
    for key, pattern in [("menuUrl", r"^menu$"), ("reservationUrl", r"reserv|book a table"), ("orderUrl", r"online order|order online|order now")]:
        matches = [link for link in content["links"] if re.search(pattern, link["title"], re.I)]
        targets = {link["url"] for link in matches}
        if key not in fields and len(targets) == 1:
            put(key, matches[0]["url"], matches[0]["title"])
    return fields, content, None


def collect(request):
    channel = request["channel"]
    if channel in ["google_maps", "yelp"]:
        raise ValueError("Platform data requires the dedicated real-time API adapter; HTML collection is disabled")
    url = request["url"]
    host = (urlparse(url).hostname or "").lower()
    if host == "yelp.com" or host.endswith(".yelp.com") or host in ["maps.app.goo.gl", "maps.google.com"] or (host in ["google.com", "www.google.com"] and urlparse(url).path.startswith("/maps")):
        raise ValueError("Platform pages require the dedicated real-time API adapter")
    if channel == "google_maps" and not (host in ["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl"]):
        raise ValueError("Google collection requires a Google Maps URL")
    if channel == "yelp" and not (host == "yelp.com" or host.endswith(".yelp.com")):
        raise ValueError("Yelp collection requires a Yelp URL")
    evidence_id = str(uuid.uuid4())
    snapshot = {"schemaVersion": "geo.snapshot.v1", "id": request["snapshotId"], "storeId": request["storeId"], "channel": channel, "listingId": request["listingId"], "url": url, "collectedAt": datetime.now(timezone.utc).isoformat(), "method": "automatic", "collectorVersion": "geo-static-1.0.0", "status": "failed", "error": None, "evidence": [], "fields": {}}
    response, error = fetch_url(url, timeout=12, max_size=2_000_000)
    if response is None:
        snapshot["error"] = str(error)[:2000]
        return {"snapshot": snapshot}
    # requests defaults undeclared text/html to Latin-1, corrupting UTF-8 narrow spaces in hours.
    try:
        html = response.content.decode("utf-8")[:200000]
    except UnicodeDecodeError:
        html = response.text[:200000]
    snapshot["evidence"] = [{"id": evidence_id, "url": response.url, "text": html or "[empty response]", "sha256": hashlib.sha256((html or "[empty response]").encode()).hexdigest()}]
    if response.status_code != 200:
        snapshot["status"] = "blocked" if response.status_code in [401, 403, 429] else "failed"
        snapshot["error"] = f"HTTP {response.status_code}; no business data inferred"
        return {"snapshot": snapshot}
    if not any(token in response.headers.get("content-type", "").lower() for token in ["text/html", "application/xhtml"]):
        snapshot["error"] = "unsupported_content_type"
        return {"snapshot": snapshot}
    fields, content, extraction_error = extract_fields(html, response.url, evidence_id)
    if extraction_error or not any(key in fields for key in ["phone", "address", "hours.1"]):
        snapshot["status"] = "blocked"
        snapshot["error"] = extraction_error or "no_business_fields_extracted_dynamic_or_blocked_page"
    else:
        snapshot["fields"] = fields
        snapshot["status"] = "succeeded"
    result = {"snapshot": snapshot, "page": content}
    if channel == "official":
        from geo_optimizer.core.audit import run_full_audit
        try:
            result["websiteAudit"] = {"schemaVersion": "geo.website-audit.v1", "sourceUrl": url, "collectedAt": snapshot["collectedAt"], "snapshotId": snapshot["id"], "engine": "GEO Optimizer", "result": asdict(run_full_audit(url, use_cache=False)), "limitation": "Technical heuristic score, not AI recommendation probability or a verified ranking."}
        except Exception as exc:
            result["websiteAudit"] = {"sourceUrl": url, "status": "failed", "error": str(exc)[:1000]}
        checks = []
        for key in ["menuUrl", "reservationUrl", "orderUrl"]:
            target = fields.get(key, {}).get("value")
            if not isinstance(target, str):
                checks.append({"field": key, "status": "not_collected", "reason": "No unambiguous action URL extracted"})
                continue
            action, action_error = fetch_url(target, timeout=6, max_size=500000)
            checks.append({"field": key, "url": target, "checkedAt": datetime.now(timezone.utc).isoformat(), "status": "reachable" if action is not None and 200 <= action.status_code < 300 else "unverifiable", "httpStatus": action.status_code if action is not None else None, "finalUrl": action.url if action is not None else None, "error": action_error, "bodySha256": hashlib.sha256(action.content).hexdigest() if action is not None else None, "limitation": "Read-only HTTP reachability check; does not place orders, submit reservations, or prove transaction completion."})
        result["websiteAudit"]["actionChecks"] = checks
    return result


if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.read(20000))
        print(json.dumps(collect(request), ensure_ascii=False, default=str))
    except Exception as exc:
        print(json.dumps({"error": str(exc)[:2000]}))
        sys.exit(1)
