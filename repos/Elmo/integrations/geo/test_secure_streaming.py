from __future__ import annotations
import unittest
from unittest.mock import Mock, patch
from requests import Response
from geo_optimizer.utils.http import _fetch_with_manual_redirects


class UnconsumedResponse(Response):
    @property
    def content(self):
        if not self._content_consumed:
            raise AssertionError("Unbounded Response.content must not be accessed before streaming")
        return super().content

    def iter_content(self, chunk_size=1, decode_unicode=False):
        yield b"1234"
        yield b"5678"


class SecureStreamingTests(unittest.TestCase):
    def test_unconsumed_response_enforces_bound_before_eager_content_access(self):
        response = UnconsumedResponse()
        response.status_code = 200
        response.raw = Mock()
        response.url = "https://example.com"
        with patch("geo_optimizer.utils.http.create_session_with_retry", return_value=Mock()), patch("geo_optimizer.utils.http._execute_request", return_value=response):
            result, error = _fetch_with_manual_redirects("https://example.com", timeout=1, max_size=5, pinned_ips=["93.184.216.34"])
        self.assertIsNone(result)
        self.assertIn("too large", error)
        response.raw.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
