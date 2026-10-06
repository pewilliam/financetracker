import base64
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Category, DesiredProduct, OfferPriceHistory, ProductOffer, User
from app.security import create_access_token


PREFIX = "/api/desired-products"
IMAGE = "data:image/png;base64," + base64.b64encode(
    base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")
).decode()


class DesiredProductAPITests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        with self.sessions() as db:
            users = [User(name=name, email=f"{name}@example.com", password_hash="unused") for name in ("one", "two")]
            db.add_all(users)
            db.commit()
            self.headers, self.other_headers = [{"Authorization": f"Bearer {create_access_token(user)}"} for user in users]
        def database():
            with self.sessions() as db:
                yield db
        app.dependency_overrides[get_db] = database
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.engine.dispose()

    def request(self, method, path="", payload=None, expected=200, headers=None):
        response = self.client.request(method, PREFIX + path, json=payload, headers=headers or self.headers)
        self.assertEqual(response.status_code, expected, response.text)
        return response.json() if response.content else None

    def product(self, **values):
        return self.request("POST", payload={"name": "Notebook", **values}, expected=201)

    def offer(self, product, **values):
        data = {"store": "Amazon", "price": "3499.00", "recorded_at": "2026-10-06", **values}
        return self.request("POST", f"/{product['id']}/offers", data, expected=201)

    def test_complete_create_compare_history_purchase_and_delete_flow(self):
        product = self.product(image_data=IMAGE, category="Tecnologia", priority="high", target_price="3200.00", planned_purchase_date="2026-11-01")
        self.assertEqual(product["image_data"], IMAGE)
        self.assertEqual(product["offer_count"], 0)
        product = self.offer(product, shipping="20.00")
        product = self.offer(product, store="Mercado Livre", price="3299.00", payment_method="credit", installment_count=10)
        best = product["offers"][1]
        self.assertEqual(best["installment_amount"], "329.90")
        self.assertEqual(product["best_price"], "3299.00")
        self.assertEqual(product["highest_price"], "3519.00")
        self.assertEqual(product["savings"], "220.00")
        self.assertEqual(product["best_offer_id"], best["id"])
        updated = {"store": "Mercado Livre", "price": "3199.00", "shipping": "0.00", "payment_method": "pix", "recorded_at": "2026-10-07"}
        product = self.request("PUT", f"/{product['id']}/offers/{best['id']}", updated)
        history = product["offers"][1]["price_history"]
        self.assertEqual([row["price"] for row in history], ["3299.00", "3199.00"])
        self.assertEqual(history[0]["recorded_at"], "2026-10-06")
        self.assertEqual(history[1]["recorded_at"], "2026-10-07")
        product = self.request("PUT", f"/{product['id']}/offers/{best['id']}", {**updated, "notes": "Só observação"})
        self.assertEqual(len(product["offers"][1]["price_history"]), 2)
        product = self.request("POST", f"/{product['id']}/purchase", {"chosen_offer_id": best["id"], "paid_price": "3100.00", "purchase_date": "2026-10-07", "payment_method": "pix"})
        self.assertEqual(product["status"], "bought")
        self.assertEqual(product["paid_price"], "3100.00")
        self.assertEqual(product["purchase_offer_snapshot"]["price"], "3199.00")
        self.request("DELETE", f"/{product['id']}/offers/{best['id']}", expected=204)
        product = self.request("GET", f"/{product['id']}")
        self.assertEqual(product["chosen_offer_id"], best["id"])
        self.assertEqual(product["purchase_store"], "Mercado Livre")
        self.assertEqual(product["offer_count"], 1)
        with self.sessions() as db:
            self.assertEqual(db.query(OfferPriceHistory).count(), 3)
        self.request("DELETE", f"/{product['id']}", expected=204)
        self.assertEqual(self.request("GET"), [])
        with self.sessions() as db:
            self.assertEqual(db.query(ProductOffer).count(), 0)
            self.assertEqual(db.query(OfferPriceHistory).count(), 0)

    def test_all_nested_routes_enforce_user_and_product_ownership(self):
        product = self.offer(self.product())
        path = f"/{product['id']}"
        offer_id = product["offers"][0]["id"]
        foreign_product = self.request("POST", payload={"name": "Other"}, expected=201, headers=self.other_headers)
        self.assertEqual([row["id"] for row in self.request("GET", headers=self.other_headers)], [foreign_product["id"]])
        for method, suffix, payload in [
            ("GET", "", None), ("PATCH", "", {"name": "Invadido"}), ("DELETE", "", None),
            ("POST", "/offers", {"store": "X", "price": "10.00"}),
            ("PUT", f"/offers/{offer_id}", {"store": "X", "price": "10.00"}),
            ("DELETE", f"/offers/{offer_id}", None),
            ("POST", "/purchase", {"chosen_offer_id": offer_id, "paid_price": "10.00", "purchase_date": "2026-10-06", "payment_method": "pix"}),
        ]:
            with self.subTest(method=method, suffix=suffix):
                self.request(method, path + suffix, payload, expected=404, headers=self.other_headers)
        # An owned product does not authorize another product's offer ID.
        self.request("PUT", f"/{foreign_product['id']}/offers/{offer_id}", {"store": "X", "price": "10.00"}, expected=404, headers=self.other_headers)
        response = self.client.get(PREFIX)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.client.get(PREFIX, headers={"Authorization": "Bearer invalid"}).status_code, 401)

    def test_money_validation_and_installment_rounding_preserve_comparison(self):
        product = self.product()
        product = self.offer(product, price="100.00", payment_method="credit", installment_count=3)
        self.assertEqual(product["best_price"], "100.00")
        self.assertEqual(product["offers"][0]["installment_amount"], "33.33")
        product = self.offer(product, price="100.00", shipping="0.10", payment_method="credit", installment_count=3, installment_amount="40.00")
        self.assertEqual(product["offers"][1]["total_cost"], "100.10")
        self.assertEqual(product["offers"][1]["installment_amount"], "40.00")
        for changes in [{"price": "0"}, {"price": "1.001"}, {"price": "NaN"}, {"price": "100000000.00"}, {"shipping": "-1"}, {"price": "99999999.99", "shipping": "0.01"}, {"payment_method": "credit"}, {"installment_count": 2}, {"url": "javascript:alert(1)"}, {"url": "https://user:pass@host.com"}]:
            with self.subTest(changes=changes):
                self.request("POST", f"/{product['id']}/offers", {"store": "X", "price": "10.00", **changes}, expected=422)
        self.assertEqual(self.request("GET", f"/{product['id']}")["offer_count"], 2)

    def test_product_validation_optional_fields_and_status_transitions(self):
        for payload in [{"name": "  "}, {"name": "X", "user_id": 2}, {"name": "X", "image_data": "data:image/svg+xml;base64,AAAA"}, {"name": "X", "image_data": "data:image/png;base64,YWJj"}, {"name": "X", "target_price": "1.001"}, {"name": "X", "status": "bought"}]:
            self.request("POST", payload=payload, expected=422)
        product = self.product(name="  Tênis  ", target_price="0.00")
        self.assertEqual(product["name"], "Tênis")
        for field in ("name", "status", "priority"):
            self.request("PATCH", f"/{product['id']}", {field: None}, expected=422)
        for status in ("planning", "ready", "abandoned", "want"):
            result = self.request("PATCH", f"/{product['id']}", {"status": status})
            self.assertEqual(result["status"], status)
        product = self.request("PATCH", f"/{product['id']}", {"target_price": None, "image_data": None, "planned_purchase_date": None})
        self.assertIsNone(product["target_price"])

    def test_purchase_snapshot_is_independent_of_future_offer_edits(self):
        product = self.offer(self.product(), payment_method="credit", installment_count=10)
        offer = product["offers"][0]
        product = self.request("POST", f"/{product['id']}/purchase", {"chosen_offer_id": offer["id"], "paid_price": "3600.00", "purchase_date": "2026-10-06", "payment_method": "credit", "installment_count": 10})
        self.assertEqual(product["purchase_installment_amount"], "360.00")
        product = self.request("PUT", f"/{product['id']}/offers/{offer['id']}", {"store": "Changed", "price": "5000.00"})
        self.assertEqual(product["purchase_store"], "Amazon")
        self.assertEqual(product["purchase_offer_snapshot"]["price"], "3499.00")
        self.request("PATCH", f"/{product['id']}", {"name": "New name"})
        product = self.request("GET", f"/{product['id']}")
        self.assertEqual(product["paid_price"], "3600.00")
        product = self.request("PATCH", f"/{product['id']}", {"status": "planning"})
        self.assertIsNone(product["chosen_offer_id"])
        self.assertIsNone(product["purchase_offer_snapshot"])

    def test_category_ownership_rename_and_delete(self):
        own = self.client.post("/api/categories", headers=self.headers, json={"name": "Tecnologia", "color": "#64748B"}).json()
        foreign = self.client.post("/api/categories", headers=self.other_headers, json={"name": "Tecnologia"}).json()
        product = self.product(category_id=own["id"], ean="7891234567895", source_url="https://example.com/notebook")
        self.assertEqual(product["category"], "Tecnologia")
        self.assertEqual(product["category_id"], own["id"])
        self.request("POST", payload={"name": "X", "category_id": foreign["id"]}, expected=404)
        self.request("PATCH", f"/{product['id']}", {"category_id": foreign["id"]}, expected=404)
        self.client.put(f"/api/categories/{own['id']}", headers=self.headers, json={"name": "Eletrônicos"})
        self.assertEqual(self.request("GET", f"/{product['id']}")["category"], "Eletrônicos")
        response = self.client.delete(f"/api/categories/{own['id']}", headers=self.headers)
        self.assertEqual(response.status_code, 204, response.text)
        result = self.request("GET", f"/{product['id']}")
        self.assertIsNone(result["category_id"])
        self.assertIsNone(result["category"])
        self.assertEqual(result["ean"], "7891234567895")
        for changes in [{"ean": "ABC"}, {"source_url": "javascript:alert(1)"}, {"image_source": "invalid"}]:
            self.request("PATCH", f"/{product['id']}", changes, expected=422)

    def test_url_preview_authentication_confirmation_and_failure(self):
        from app.services.product_metadata import MetadataError
        metadata = {"url": "https://example.com/product", "name": "Notebook importado", "ean": "7891234567895", "description": "Descrição da loja", "image_data": IMAGE, "image_url": "https://example.com/photo.png", "store": "Loja", "price": "3499.00", "currency": "BRL", "warnings": []}
        with patch("app.routers.desired_products.import_product_metadata", return_value=metadata) as fetch:
            self.assertEqual(self.client.post(PREFIX + "/import-url", json={"url": metadata["url"]}).status_code, 401)
            fetch.assert_not_called()
            self.assertEqual(self.request("POST", "/import-url", {"url": metadata["url"]}), metadata)
            self.assertEqual(self.request("GET"), [])  # Preview never saves or creates an offer.
            product = self.product(name=metadata["name"], ean=metadata["ean"], description=metadata["description"], image_data=IMAGE, image_source="url", source_url=metadata["url"])
            self.assertEqual(product["image_source"], "url")
            self.assertEqual(self.request("GET", f"/{product['id']}")["ean"], metadata["ean"])
        with patch("app.routers.desired_products.import_product_metadata", side_effect=MetadataError("Loja indisponível")):
            self.request("POST", "/import-url", {"url": metadata["url"]}, expected=422)
        self.request("POST", "/import-url", {"url": "file:///etc/passwd"}, expected=422)


class DesiredProductMigrationTests(unittest.TestCase):
    def test_upgrade_and_downgrade_preserve_existing_tables(self):
        path = Path(__file__).parents[1] / "alembic/versions/0039_desired_products.py"
        spec = importlib.util.spec_from_file_location("desired_migration", path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        import_path = Path(__file__).parents[1] / "alembic/versions/0040_product_import.py"
        import_spec = importlib.util.spec_from_file_location("import_migration", import_path)
        import_migration = importlib.util.module_from_spec(import_spec)
        import_spec.loader.exec_module(import_migration)
        engine = create_engine("sqlite://")
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql("CREATE TABLE categories (id INTEGER PRIMARY KEY, user_id INTEGER, name VARCHAR(80))")
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                migration.upgrade()
                connection.exec_driver_sql("INSERT INTO categories (id, user_id, name) VALUES (7, 1, 'Tecnologia'), (8, 2, 'Tecnologia')")
                connection.exec_driver_sql("INSERT INTO desired_products (id, user_id, name, category) VALUES (1, 1, 'Notebook', 'Tecnologia'), (2, 2, 'Tablet', 'Tecnologia'), (3, 1, 'Tênis', 'Roupas')")
                import_migration.upgrade()
                self.assertEqual(connection.exec_driver_sql("SELECT category_id FROM desired_products ORDER BY id").scalars().all(), [7, 8, None])
                for model in (DesiredProduct, ProductOffer, OfferPriceHistory):
                    self.assertEqual({column.name for column in model.__table__.columns}, {column["name"] for column in inspect(connection).get_columns(model.__tablename__)})
                import_migration.downgrade()
                self.assertEqual(connection.exec_driver_sql("SELECT category FROM desired_products WHERE id=3").scalar(), "Roupas")
                migration.downgrade()
            self.assertEqual(inspect(connection).get_table_names(), ["categories", "users"])
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
