from __future__ import annotations
import unittest
from unittest.mock import patch
from requests import Response
from audit_website import audit_website, technical_audit
from collect import collect


def response(url, html, content_type="text/html", status=200):
    value = Response()
    value.url = url
    value.status_code = status
    value._content = html.encode()
    value.encoding = "utf-8"
    value.headers["content-type"] = content_type
    return value


class WebsitePreparationTests(unittest.TestCase):
    def test_missing_business_fields_still_gets_technical_audit(self):
        html = "<html><title>A restaurant</title><h1>A restaurant</h1><p>No address in this page</p></html>"
        calls = []
        def fetch(url, **_):
            calls.append(url)
            return response(url, html), None
        result = audit_website({"url": "https://example.com"}, fetch=fetch)
        self.assertEqual(result["website"]["pageFetch"]["status"], "succeeded")
        self.assertEqual(result["website"]["websiteAudit"]["status"], "succeeded")
        self.assertIsInstance(result["website"]["websiteAudit"]["score"], int)
        self.assertNotIn("address", result["website"]["candidates"][0])
        self.assertEqual(len(calls), 3)

    def test_multiple_locations_are_preserved_for_customer_selection(self):
        html = '<script type="application/ld+json">[{"@type":"Restaurant","name":"Chain","address":{"streetAddress":"1 Main St","addressLocality":"Boston","addressRegion":"MA"}},{"@type":"Restaurant","name":"Chain","address":{"streetAddress":"2 Main St","addressLocality":"Boston","addressRegion":"MA"}}]</script>'
        result = audit_website({"url": "https://example.com"}, fetch=lambda url, **_: (response(url, html), None), run_technical=lambda *_: {"status": "succeeded", "score": 50})
        self.assertEqual(len(result["website"]["candidates"]), 2)
        self.assertEqual(result["website"]["websiteAudit"]["status"], "succeeded")

    def test_five_page_bound_and_same_origin_links(self):
        calls = []
        html = '<h1>A</h1>' + ''.join(f'<a href="/menu/{number}">Menu {number}</a>' for number in range(12)) + '<a href="https://other.example/contact">Contact</a>'
        def fetch(url, **_):
            calls.append(url)
            return response(url, html), None
        result = audit_website({"url": "https://example.com"}, fetch=fetch, run_technical=lambda *_: {"status": "succeeded"})
        self.assertEqual(len(result["pages"]), 5)
        self.assertEqual(len(calls), 5)
        self.assertTrue(all(url.startswith("https://example.com") for url in calls))

    def test_blocked_site_has_no_invented_score(self):
        result = audit_website({"url": "https://example.com"}, fetch=lambda *_args, **_kw: (None, "blocked private address"))
        self.assertEqual(result["website"]["websiteAudit"]["status"], "failed")
        self.assertIsNone(result["website"]["websiteAudit"]["score"])
        self.assertEqual(result["website"]["candidates"], [])

    def test_excerpt_never_runs_technical_or_more_than_one_page(self):
        def no_technical(*_):
            raise AssertionError("Excerpt should not run technical checks")
        result = audit_website({"url": "https://example.com", "mode": "excerpt"}, fetch=lambda url, **_: (response(url, '<h1>A</h1><a href="/menu">Menu</a>'), None), run_technical=no_technical)
        self.assertEqual(len(result["pages"]), 1)
        self.assertEqual(result["website"]["websiteAudit"]["status"], "not_started")

    def test_legacy_collector_runs_technical_after_extraction_failure(self):
        html = '<h1>Restaurant without contact fields</h1>'
        with patch("collect.fetch_url", return_value=(response("https://example.com", html), None)), patch("geo_optimizer.core.audit.run_full_audit", return_value=type("Audit", (), {})()) as audit:
            # The asdict failure is retained as a website-stage failure; extraction
            # status must not prevent attempting the independent technical stage.
            result = collect({"channel": "official", "url": "https://example.com", "snapshotId": "s", "storeId": "r", "listingId": "l"})
        self.assertEqual(audit.call_count, 1)
        self.assertEqual(result["snapshot"]["status"], "blocked")
        self.assertIn("websiteAudit", result)


if __name__ == "__main__":
    unittest.main()
