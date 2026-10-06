import base64
import json
import socket
import time
import unittest
from email.message import Message
from unittest.mock import MagicMock, patch

from app.services.product_metadata import MetadataError, PublicConnection, fetch_public, import_product_metadata, parse_metadata, public_target

PUBLIC = (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))


def headers(mime):
    result = Message()
    result["Content-Type"] = mime
    return result


class ProductMetadataTests(unittest.TestCase):
    def test_jsonld_graph_references_and_priority(self):
        html = '<meta property="og:title" content="Fallback"><script type="application/ld+json">' + json.dumps({"@graph": [
            {"@type": "Product", "name": "Notebook &amp; Tela", "gtin13": "7891234567895", "description": "<b>Notebook</b> com tela", "image": [{"url": "/photo.png"}], "offers": {"@id": "#offer"}},
            {"@id": "#offer", "@type": "Offer", "price": "3499.90", "priceCurrency": "BRL", "seller": {"name": "Minha loja"}},
        ]}) + '</script>'
        result = parse_metadata(html, "https://example.com/product")
        self.assertEqual(result["name"], "Notebook & Tela")
        self.assertEqual(result["description"], "Notebook com tela")
        self.assertEqual(result["ean"], "7891234567895")
        self.assertEqual(result["image_url"], "https://example.com/photo.png")
        self.assertEqual(result["price"], "3499.90")
        self.assertEqual(result["store"], "Minha loja")
        self.assertEqual(result["currency"], "BRL")

    def test_open_graph_and_html_fallback_with_missing_fields(self):
        html = '<script type="application/ld+json">{invalid</script><title>HTML title</title><meta property="og:title" content="Tênis"><meta name="description" content="Confortável"><meta property="og:image" content="javascript:bad"><meta itemprop="gtin13" content="invalid">'
        result = parse_metadata(html, "https://example.com/product")
        self.assertEqual(result["name"], "Tênis")
        self.assertEqual(result["description"], "Confortável")
        self.assertIsNone(result["ean"])
        self.assertIsNone(result["image_url"])
        self.assertIsNone(result["price"])
        self.assertEqual(parse_metadata('<title>HTML title</title>', 'https://example.com/')['name'], 'HTML title')

    def test_rejects_internal_addresses_ports_credentials_and_mixed_dns(self):
        for url in ['file:///etc/passwd', 'http://user:pass@example.com', 'https://example.com:8443', 'http://example.com/\r\nheader', 'https://example.com\\@127.0.0.1']:
            with self.subTest(url=url), patch('socket.getaddrinfo', return_value=[PUBLIC]):
                with self.assertRaises(MetadataError):
                    public_target(url)
        for address in ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.5', '224.0.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1']:
            with self.subTest(address=address), patch('socket.getaddrinfo', return_value=[PUBLIC, (socket.AF_INET, socket.SOCK_STREAM, 6, '', (address, 443))]):
                with self.assertRaises(MetadataError):
                    public_target('https://example.com/')

    def test_connects_to_checked_ip_and_verifies_original_tls_hostname(self):
        sock = MagicMock()
        tls = MagicMock()
        with patch('socket.socket', return_value=sock), patch('ssl.create_default_context', return_value=tls):
            connection = PublicConnection('shop.example.com', 443, PUBLIC, True, 5)
            connection.connect()
            sock.connect.assert_called_once_with(('93.184.216.34', 443))
            tls.wrap_socket.assert_called_once_with(sock, server_hostname='shop.example.com')

    def test_redirects_revalidated_and_size_and_time_limited(self):
        response = MagicMock(status=302)
        response.getheader.return_value = 'http://127.0.0.1/private'
        connection = MagicMock()
        connection.getresponse.return_value = response
        with patch('socket.getaddrinfo', side_effect=[[PUBLIC], [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 80))]]), patch('app.services.product_metadata.PublicConnection', return_value=connection):
            with self.assertRaises(MetadataError):
                fetch_public('https://example.com/', max_bytes=100, deadline=time.monotonic() + 10)
            self.assertEqual(connection.request.call_count, 1)
            connection.close.assert_called()
        response.status = 200
        response.getheader.return_value = 'identity'
        response.read.return_value = b'x' * 101
        with patch('socket.getaddrinfo', return_value=[PUBLIC]), patch('app.services.product_metadata.PublicConnection', return_value=connection):
            with self.assertRaises(MetadataError):
                fetch_public('https://example.com/', max_bytes=100, deadline=time.monotonic() + 10)
            with self.assertRaises(MetadataError):
                fetch_public('https://example.com/', max_bytes=100, deadline=time.monotonic() - 1)

    def test_imports_valid_image_and_keeps_partial_results_when_image_fails(self):
        html = b'<meta property="og:title" content="Notebook"><meta property="og:image" content="/photo.png">'
        image = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
        with patch('app.services.product_metadata.fetch_public', side_effect=[(html, headers('text/html'), 'https://example.com/product'), (image, headers('image/png'), 'https://example.com/photo.png')]):
            result = import_product_metadata('https://example.com/product')
            self.assertTrue(result['image_data'].startswith('data:image/png;base64,'))
            self.assertEqual(result['name'], 'Notebook')
        with patch('app.services.product_metadata.fetch_public', side_effect=[(html, headers('text/html'), 'https://example.com/product'), MetadataError('blocked')]):
            result = import_product_metadata('https://example.com/product')
            self.assertIsNone(result['image_data'])
            self.assertEqual(result['name'], 'Notebook')
            self.assertTrue(any('imagem' in warning for warning in result['warnings']))
