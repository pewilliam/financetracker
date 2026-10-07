import json
import os
import unittest
from decimal import Decimal
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from app.services import offer_search
from app.services.offer_search import OfferSearchProviderError, resolve_serpapi_offer, search_serpapi_offers


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self):
        return json.dumps(self.payload).encode()


class OfferSearchTests(unittest.TestCase):
    def setUp(self):
        offer_search._cache.clear()
        offer_search._resolve_cache.clear()

    def tearDown(self):
        offer_search._cache.clear()
        offer_search._resolve_cache.clear()

    def test_requires_a_server_side_api_key(self):
        with patch.dict(os.environ, {"SERPAPI_API_KEY": ""}, clear=False):
            with self.assertRaises(OfferSearchProviderError) as context:
                search_serpapi_offers("Adidas Superstar")
        self.assertEqual(context.exception.status_code, 503)

    @patch("app.services.offer_search.urlopen")
    def test_normalizes_results_and_uses_cache(self, urlopen):
        urlopen.return_value = FakeResponse({"shopping_results": [
            {
                "product_id": "123", "title": "Adidas Superstar II", "source": "Loja A",
                "extracted_price": 599.9, "link": "https://shop.example/adidas",
                "thumbnail": "https://shop.example/adidas.jpg", "delivery": "Frete grátis",
                "rating": "4.7", "reviews": "321",
                "installment": {"period": 6, "extracted_price": 99.98},
            },
            {"title": "Sem preço", "source": "Loja B", "product_link": "https://shop.example/b"},
        ]})
        with patch.dict(os.environ, {"SERPAPI_API_KEY": "private-key", "SERPAPI_CACHE_SECONDS": "600"}, clear=False):
            first = search_serpapi_offers("  Adidas   Superstar  ", 10)
            second = search_serpapi_offers("adidas superstar", 10)

        self.assertEqual(len(first), 1)
        self.assertEqual(first[0]["price"], Decimal("599.90"))
        self.assertEqual(first[0]["shipping"], Decimal("0.00"))
        self.assertEqual(first[0]["installment_count"], 6)
        self.assertEqual(first[0]["installment_amount"], Decimal("99.98"))
        self.assertEqual(second, first)
        self.assertEqual(urlopen.call_count, 1)
        request = urlopen.call_args.args[0]
        query = parse_qs(urlsplit(request.full_url).query)
        self.assertEqual(query["q"], ["Adidas Superstar"])
        self.assertEqual(query["api_key"], ["private-key"])
        self.assertEqual(query["gl"], ["br"])
        self.assertEqual(query["hl"], ["pt-br"])
        self.assertEqual(query["google_domain"], ["google.com.br"])
        self.assertEqual(query["direct_link"], ["true"])

    @patch("app.services.offer_search.urlopen")
    def test_resolves_the_selected_google_product_to_the_merchant_site(self, urlopen):
        urlopen.return_value = FakeResponse({"product_results": {"stores": [
            {"name": "Outra Loja", "link": "https://other.example/item", "extracted_price": 599.90},
            {"name": "Loja A", "link": "https://www.google.com/url?q=https%3A%2F%2Fshop.example%2Fadidas%3Fsku%3D123", "extracted_price": 599.90},
        ]}})
        token = "immersive-product-token-123456789"
        with patch.dict(os.environ, {"SERPAPI_API_KEY": "private-key", "SERPAPI_CACHE_SECONDS": "600"}, clear=False):
            first = resolve_serpapi_offer(token, "Loja A", Decimal("599.90"))
            second = resolve_serpapi_offer(token, "Loja A", Decimal("599.90"))

        self.assertEqual(first, "https://shop.example/adidas?sku=123")
        self.assertEqual(second, first)
        self.assertEqual(urlopen.call_count, 1)
        query = parse_qs(urlsplit(urlopen.call_args.args[0].full_url).query)
        self.assertEqual(query["engine"], ["google_immersive_product"])
        self.assertEqual(query["page_token"], [token])


if __name__ == "__main__":
    unittest.main()
