"""Read a single public product page; never execute scripts or search other stores."""
import base64
import http.client
import ipaddress
import json
import re
import socket
import ssl
import time
from decimal import Decimal, InvalidOperation
from html import unescape
from html.parser import HTMLParser
from urllib.parse import quote, urljoin, urlsplit, urlunsplit

MAX_HTML_BYTES = 2 * 1024 * 1024
MAX_IMAGE_BYTES = 1024 * 1024


class MetadataError(ValueError):
    pass


def public_target(url):
    try:
        parts = urlsplit(url)
        host = (parts.hostname or "").encode("idna").decode("ascii")
        port = parts.port or (443 if parts.scheme == "https" else 80)
        if (parts.scheme not in {"http", "https"} or not host or parts.username or parts.password
                or port != (443 if parts.scheme == "https" else 80) or any(ord(c) < 33 for c in url)
                or "\\" in url):
            raise MetadataError("Informe uma URL pública HTTP ou HTTPS, sem credenciais ou porta personalizada.")
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        # Reject mixed public/private DNS answers too. Connect to this exact checked address.
        if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global or ipaddress.ip_address(item[4][0]).is_multicast or ipaddress.ip_address(item[4][0]).is_reserved for item in addresses):
            raise MetadataError("A URL deve apontar para uma loja pública na internet.")
        return parts, host, port, addresses[0]
    except (ValueError, UnicodeError, OSError) as exc:
        if isinstance(exc, MetadataError):
            raise
        raise MetadataError("Não foi possível validar o endereço da loja.") from exc


class PublicConnection(http.client.HTTPConnection):
    def __init__(self, host, port, address, secure, timeout):
        super().__init__(host, port, timeout=timeout)
        self.address = address
        self.secure = secure

    def connect(self):
        family, socktype, protocol, _, address = self.address
        connection = socket.socket(family, socktype, protocol)
        try:
            connection.settimeout(self.timeout)
            connection.connect(address)
            self.sock = ssl.create_default_context().wrap_socket(connection, server_hostname=self.host) if self.secure else connection
        except Exception:
            connection.close()
            raise


def fetch_public(url, *, max_bytes, deadline):
    for _ in range(4):
        parts, host, port, address = public_target(url)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise MetadataError("A loja demorou para responder. Preencha os dados manualmente.")
        connection = PublicConnection(host, port, address, parts.scheme == "https", min(7, remaining))
        try:
            path = quote(urlunsplit(("", "", parts.path or "/", parts.query, "")), safe="/%?=&:+,;@!$()*'~-._")
            connection.request("GET", path, headers={"User-Agent": "Kashy365/1.0 (product metadata preview)", "Accept": "text/html,application/xhtml+xml,image/*", "Accept-Encoding": "identity"})
            transport = connection.sock
            response = connection.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                location = response.getheader("Location")
                if not location:
                    raise MetadataError("A loja retornou um redirecionamento inválido.")
                url = urljoin(url, location)
                continue  # Validate every redirect, including image redirects.
            if response.status != 200:
                raise MetadataError("A loja não permitiu a leitura. Você pode preencher os dados manualmente.")
            if response.getheader("Content-Encoding", "identity").lower() != "identity":
                raise MetadataError("A loja retornou um formato não suportado. Preencha os dados manualmente.")
            body = bytearray()
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise MetadataError("A loja demorou para responder. Preencha os dados manualmente.")
                transport.settimeout(min(7, remaining))
                chunk = response.read(min(65536, max_bytes + 1 - len(body)))
                if not chunk:
                    break
                body.extend(chunk)
                if len(body) > max_bytes:
                    raise MetadataError("O conteúdo da loja excede o limite de leitura.")
            return bytes(body), response.headers, url
        except (OSError, http.client.HTTPException) as exc:
            raise MetadataError("Não foi possível acessar a loja. Preencha os dados manualmente.") from exc
        finally:
            connection.close()
    raise MetadataError("A loja retornou redirecionamentos demais. Use o link direto do produto.")


class PageMetadata(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.documents = []
        self.title = ""
        self.in_title = False
        self.in_json = False
        self.json_parts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            key = (attrs.get("property") or attrs.get("name") or attrs.get("itemprop") or "").lower()
            self.meta.setdefault(key, attrs.get("content", ""))
        if tag == "title":
            self.in_title = True
        if tag == "script" and attrs.get("type", "").lower().split(";")[0].strip() == "application/ld+json":
            self.in_json = True
            self.json_parts = []

    def handle_data(self, value):
        if self.in_title:
            self.title += value
        if self.in_json:
            self.json_parts.append(value)

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "script" and self.in_json:
            self.in_json = False
            try:
                self.documents.append(json.loads("".join(self.json_parts)))
            except (ValueError, RecursionError):
                pass


def clean_text(value, limit):
    if not isinstance(value, (str, int)):
        return None
    text = " ".join(unescape(re.sub(r"<[^>]+>", " ", str(value))).split())
    return text[:limit] or None


def nodes(value, depth=0):
    if depth > 30:
        return
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from nodes(child, depth + 1)
    elif isinstance(value, list):
        for child in value:
            yield from nodes(child, depth + 1)


def first_image(value):
    if isinstance(value, list):
        return first_image(value[0]) if value else None
    if isinstance(value, dict):
        return first_image(value.get("url") or value.get("contentUrl"))
    return value if isinstance(value, str) else None


def public_link(value, base):
    if not isinstance(value, str):
        return None
    candidate = urljoin(base, value.strip())
    try:
        parts = urlsplit(candidate)
        if parts.scheme in {"http", "https"} and parts.hostname and not parts.username and not parts.password and len(candidate) <= 2048:
            return candidate
    except ValueError:
        pass
    return None


def price_value(value):
    try:
        amount = Decimal(str(value))
        if amount.is_finite() and 0 < amount <= Decimal("99999999.99") and amount == amount.quantize(Decimal(".01")):
            return str(amount.quantize(Decimal(".01")))
    except (InvalidOperation, ValueError):
        pass
    return None


def parse_metadata(html, url):
    page = PageMetadata()
    try:
        page.feed(html)
    except (ValueError, RecursionError):
        raise MetadataError("Não foi possível ler os metadados desta página.")
    all_nodes = [node for document in page.documents for node in nodes(document)]
    by_id = {node["@id"]: node for node in all_nodes if isinstance(node.get("@id"), str)}
    product = next((node for node in all_nodes if any(str(kind).rsplit("/", 1)[-1] == "Product" for kind in (node.get("@type") if isinstance(node.get("@type"), list) else [node.get("@type")]))), {})
    offers = product.get("offers", {})
    if isinstance(offers, list):
        offers = offers[0] if offers else {}
    if not isinstance(offers, dict):
        offers = {}
    offers = by_id.get(offers.get("@id"), offers)
    seller = offers.get("seller") or product.get("seller") or {}
    if isinstance(seller, dict):
        seller = by_id.get(seller.get("@id"), seller).get("name")
    meta = page.meta
    ean = str(product.get("gtin13") or product.get("gtin8") or product.get("gtin14") or product.get("gtin12") or product.get("gtin") or meta.get("product:ean") or meta.get("gtin13") or meta.get("gtin") or "").strip()
    currency = clean_text(offers.get("priceCurrency") or meta.get("product:price:currency") or meta.get("og:price:currency"), 3)
    return {
        "url": url,
        "name": clean_text(product.get("name") or meta.get("og:title") or meta.get("twitter:title") or meta.get("name") or page.title, 255),
        "description": clean_text(product.get("description") or meta.get("og:description") or meta.get("description"), 2000),
        "ean": ean if re.fullmatch(r"(?:\d{8}|\d{12}|\d{13}|\d{14})", ean) else None,
        "image_url": public_link(first_image(product.get("image")) or meta.get("og:image") or meta.get("twitter:image") or meta.get("image"), url),
        "image_data": None,
        "store": clean_text(seller or meta.get("og:site_name") or urlsplit(url).hostname, 150),
        "price": price_value(offers.get("price") or meta.get("product:price:amount") or meta.get("og:price:amount") or meta.get("price")),
        "currency": currency.upper() if currency else None,
        "warnings": [],
    }


def import_product_metadata(url):
    deadline = time.monotonic() + 15
    data, headers, final_url = fetch_public(url, max_bytes=MAX_HTML_BYTES, deadline=deadline)
    if headers.get_content_type() not in {"text/html", "application/xhtml+xml"}:
        raise MetadataError("O link deve abrir uma página de produto em HTML.")
    try:
        html = data.decode(headers.get_content_charset() or "utf-8", errors="replace")
    except LookupError:
        html = data.decode("utf-8", errors="replace")
    result = parse_metadata(html, final_url)
    if result["image_url"]:
        try:
            image, _, _ = fetch_public(result["image_url"], max_bytes=MAX_IMAGE_BYTES, deadline=deadline)
            mime = ("png" if image.startswith(b"\x89PNG\r\n\x1a\n") else "jpeg" if image.startswith(b"\xff\xd8\xff") else "webp" if image.startswith(b"RIFF") and image[8:12] == b"WEBP" else None)
            if not mime:
                raise MetadataError("Formato de imagem não suportado.")
            result["image_data"] = f"data:image/{mime};base64," + base64.b64encode(image).decode("ascii")
        except MetadataError:
            result["warnings"].append("A imagem não pôde ser importada. Adicione uma foto manualmente.")
    if not result["ean"]:
        result["warnings"].append("A loja não informou um EAN/GTIN válido.")
    if not any(result[key] for key in ("name", "description", "ean", "image_data", "price")):
        result["warnings"].append("Nenhum dado do produto encontrado. Preencha os campos manualmente.")
    return result
