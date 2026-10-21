"""Regression checks against disposable SQLite; no production database access."""
import os
import sqlite3
from decimal import Decimal
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@127.0.0.1:1/test")

from fastapi import HTTPException
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session

from routers.r_aggregate import _save
from routers.r_rest import _table_or_404, _writable_table_or_404
from services.aggregate_save import save_katalog, save_katalog_foto, save_pbb
from services.rest_query import delete_rows, query_rows, strip_generated, update_rows


class RestAggregateTests(unittest.TestCase):
    def setUp(self):
        sqlite3.register_adapter(Decimal, str)
        self.engine = create_engine("sqlite://")
        self.db = Session(self.engine)
        for ddl in (
            'CREATE TABLE aset (id TEXT PRIMARY KEY, nama_aset TEXT)',
            'CREATE TABLE kerja_sama (id TEXT PRIMARY KEY, aset_id TEXT)',
            "CREATE TABLE kompensasi (id TEXT PRIMARY KEY, ks_id TEXT, nominal NUMERIC DEFAULT 100, tgl_jatuh_tempo TEXT DEFAULT '2026-01-01', keterangan TEXT)",
            'CREATE TABLE pendapatan_diterima_dimuka (id TEXT PRIMARY KEY, ks_id TEXT, total_nkm NUMERIC)',
            'CREATE TABLE pengakuan_pendapatan (id TEXT PRIMARY KEY, kompensasi_id TEXT, status TEXT, pddm_id TEXT)',
            'CREATE TABLE pembayaran (id TEXT PRIMARY KEY, kompensasi_id TEXT)',
            'CREATE TABLE cash_in (id TEXT PRIMARY KEY, ks_id TEXT, nominal NUMERIC)',
            'CREATE TABLE pbb (id TEXT PRIMARY KEY, aset_id TEXT, tahun INTEGER, nilai_pbb NUMERIC, UNIQUE(aset_id,tahun))',
            'CREATE TABLE pbb_objek (id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))), pbb_id TEXT, nama_objek TEXT NOT NULL, nilai_pbb_objek NUMERIC)',
            'CREATE TABLE katalog_aset (id TEXT PRIMARY KEY, aset_id TEXT, tagline TEXT)',
            'CREATE TABLE katalog_aksesibilitas (id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))), katalog_id TEXT, urutan INTEGER, label TEXT NOT NULL, nilai TEXT)',
            'CREATE TABLE katalog_foto (id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))), katalog_id TEXT, slot_id TEXT, url TEXT NOT NULL, urutan INTEGER)',
        ):
            self.db.execute(text(ddl))
        self.db.execute(text("INSERT INTO aset VALUES ('a1','Aset contoh')"))
        self.db.execute(text("INSERT INTO kerja_sama VALUES ('ks1','a1')"))
        for i in range(50):
            self.db.execute(text("INSERT INTO kompensasi (id,ks_id) VALUES (:id,'ks1')"), {"id": f"k{i}"})
            self.db.execute(text("INSERT INTO pembayaran VALUES (:id,:kid)"), {"id": f"pay{i}", "kid": f"k{i}"})
        self.db.execute(text("INSERT INTO cash_in VALUES ('ci1','ks1',100)"))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_nested_relations_batch_in_four_queries_for_fifty_invoices(self):
        statements = []
        event.listen(self.engine, "before_cursor_execute", lambda conn, cursor, sql, params, ctx, many: statements.append(sql))
        rows = query_rows(self.db, "kompensasi", {"select": "*,pembayaran(*),kerja_sama(*,aset(*))"})
        self.assertEqual(len(statements), 4)
        self.assertEqual(len(rows), 50)
        self.assertEqual(rows[0]["kerja_sama"]["aset"]["nama_aset"], "Aset contoh")
        self.assertEqual(len(rows[0]["pembayaran"]), 1)
        self.assertEqual(query_rows(self.db, "kompensasi", {"id": "in.()"}), [])

    def test_cash_in_embeds_and_unknown_relation_rejected(self):
        rows = query_rows(self.db, "cash_in", {"select": "*,kerja_sama(*,aset(*))"})
        self.assertEqual(rows[0]["kerja_sama"]["aset"]["id"], "a1")
        with self.assertRaises(ValueError):
            query_rows(self.db, "cash_in", {"select": "missing(*)"})

    def test_explicit_null_update_and_generated_only_noop(self):
        self.db.execute(text("INSERT INTO katalog_aset VALUES ('cat1','a1','old')"))
        self.db.commit()
        rows = update_rows(self.db, "katalog_aset", {"tagline": None}, {"id": "eq.cat1"})
        self.assertIsNone(rows[0]["tagline"])
        self.assertEqual(strip_generated("kompensasi", {"nominal_ppn": 1}), {})
        self.assertEqual(update_rows(MagicMock(), "kompensasi", {"nominal_ppn": 1}, {"id": "eq.k1"}), [])

    def test_domain_tables_generic_write_blocked_get_retained(self):
        for table in ("pembayaran", "pendapatan_diterima_dimuka", "pengakuan_pendapatan", "surat_peringatan"):
            self.assertEqual(_table_or_404(table), table)
            with self.assertRaises(HTTPException) as caught:
                _writable_table_or_404(table)
            self.assertEqual(caught.exception.status_code, 405)
        self.assertEqual(_writable_table_or_404("cash_in"), "cash_in")

    def test_pbb_insert_failure_rolls_back_parent_and_deleted_children(self):
        self.db.execute(text("INSERT INTO pbb VALUES ('p1','a1',2026,100)"))
        self.db.execute(text("INSERT INTO pbb_objek (pbb_id,nama_objek,nilai_pbb_objek) VALUES ('p1','existing',100)"))
        self.db.commit()
        # Upsert the existing aset/year; child validation fails after replacing the parent.
        with self.assertRaises(HTTPException):
            _save(self.db, save_pbb, {"aset_id": "a1", "tahun": 2026}, [{"nilai_pbb_objek": 200}])
        self.assertEqual(self.db.execute(text("SELECT nilai_pbb FROM pbb")).scalar(), 100)
        self.assertEqual(self.db.execute(text("SELECT nama_objek FROM pbb_objek")).scalar(), "existing")

    def test_catalog_child_failure_rolls_back_entire_save(self):
        self.db.execute(text("INSERT INTO katalog_aset VALUES ('cat1','a1','old')"))
        self.db.execute(text("INSERT INTO katalog_aksesibilitas (katalog_id,label) VALUES ('cat1','existing')"))
        self.db.commit()
        # SQLite has no FOR UPDATE; patch only the lock, leaving CRUD/rollback real.
        from unittest.mock import patch
        with patch("services.aggregate_save._lock_parent"), self.assertRaises(HTTPException):
            _save(self.db, save_katalog, {"tagline": "new"}, {"aksesibilitas": [{}]}, "cat1")
        self.assertEqual(self.db.execute(text("SELECT tagline FROM katalog_aset")).scalar(), "old")
        self.assertEqual(self.db.execute(text("SELECT label FROM katalog_aksesibilitas")).scalar(), "existing")

    def test_photo_failure_keeps_previous_slot(self):
        self.db.execute(text("INSERT INTO katalog_aset VALUES ('cat1','a1','old')"))
        self.db.execute(text("INSERT INTO katalog_foto (katalog_id,slot_id,url) VALUES ('cat1','cover','previous')"))
        self.db.commit()
        from unittest.mock import patch
        with patch("services.aggregate_save._lock_parent"), self.assertRaises(HTTPException):
            _save(self.db, save_katalog_foto, "cat1", "cover", None)
        self.assertEqual(self.db.execute(text("SELECT url FROM katalog_foto")).scalar(), "previous")

    def test_recognized_income_prevents_invoice_deletion(self):
        self.db.execute(text("INSERT INTO pengakuan_pendapatan (id,kompensasi_id,status) VALUES ('pp1','k1','diakui')"))
        self.db.commit()
        with patch("services.pendapatan_sync.lock_pendapatan"), patch("services.pendapatan_sync.sync_pendapatan"), self.assertRaises(HTTPException) as caught:
            delete_rows(self.db, "kompensasi", {"id": "eq.k1"})
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(self.db.execute(text("SELECT COUNT(*) FROM kompensasi WHERE id='k1'")).scalar(), 1)

    def test_invoice_delete_cleans_projection_then_syncs_before_commit(self):
        from unittest.mock import patch
        self.db.execute(text("INSERT INTO pengakuan_pendapatan (id,kompensasi_id,status) VALUES ('pp1','k1','proyeksi')"))
        self.db.commit()
        sync_count = 0
        def check_sync(db):
            nonlocal sync_count
            sync_count += 1
            expected = 1 if sync_count == 1 else 0
            self.assertEqual(db.execute(text("SELECT COUNT(*) FROM kompensasi WHERE id='k1'")).scalar(), expected)
            self.assertEqual(db.execute(text("SELECT COUNT(*) FROM pengakuan_pendapatan WHERE kompensasi_id='k1'")).scalar(), expected)
        with patch("services.pendapatan_sync.lock_pendapatan") as lock, patch("services.pendapatan_sync.sync_pendapatan", side_effect=check_sync) as sync:
            delete_rows(self.db, "kompensasi", {"id": "eq.k1"})
            self.assertEqual(sync.call_count, 2)
            lock.assert_called_once_with(self.db)

    def test_catalog_update_preserves_photos_and_omitted_children(self):
        from unittest.mock import patch
        self.db.execute(text("INSERT INTO katalog_aset VALUES ('cat1','a1','old')"))
        self.db.execute(text("INSERT INTO katalog_aksesibilitas (katalog_id,label) VALUES ('cat1','existing')"))
        self.db.execute(text("INSERT INTO katalog_foto (katalog_id,slot_id,url) VALUES ('cat1','cover','photo')"))
        self.db.commit()
        with patch("services.aggregate_save._lock_parent"):
            _save(self.db, save_katalog, {"tagline": "new"}, {}, "cat1")
        self.assertEqual(self.db.execute(text("SELECT tagline FROM katalog_aset")).scalar(), "new")
        self.assertEqual(self.db.execute(text("SELECT label FROM katalog_aksesibilitas")).scalar(), "existing")
        self.assertEqual(self.db.execute(text("SELECT url FROM katalog_foto")).scalar(), "photo")

    def test_identifiers_cannot_inject_sql(self):
        from services.rest_query import insert_rows
        cases = (
            lambda: query_rows(self.db, "aset", {"order": 'id"; DROP TABLE aset;--.asc'}),
            lambda: query_rows(self.db, "aset", {'id" OR 1=1--': 'eq.a1'}),
            lambda: update_rows(self.db, "aset", {'nama_aset" = NULL --': 'x'}, {"id": "eq.a1"}),
            lambda: insert_rows(self.db, "aset", {"id": "a2"}, on_conflict='id) DO NOTHING;--'),
        )
        for operation in cases:
            with self.subTest(operation=operation), self.assertRaises(HTTPException) as caught:
                operation()
            self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(self.db.execute(text("SELECT COUNT(*) FROM aset")).scalar(), 1)

    def test_recognized_invoice_accounting_fields_immutable_metadata_allowed(self):
        self.db.execute(text("INSERT INTO pengakuan_pendapatan (id,kompensasi_id,status) VALUES ('pp1','k1','diakui')"))
        self.db.commit()
        with patch("services.pendapatan_sync.lock_pendapatan"), patch("services.pendapatan_sync.sync_pendapatan"):
            for changes in ({"nominal": 125}, {"tgl_jatuh_tempo": "2026-02-01"}, {"ks_id": "other"}):
                with self.subTest(changes=changes), self.assertRaises(HTTPException) as caught:
                    update_rows(self.db, "kompensasi", changes, {"id": "eq.k1"})
                self.assertEqual(caught.exception.status_code, 409)
            saved = update_rows(self.db, "kompensasi", {"nominal": 100.0, "tgl_jatuh_tempo": "2026-01-01", "ks_id": "ks1", "keterangan": "updated"}, {"id": "eq.k1"})
            self.assertEqual(saved[0]["keterangan"], "updated")

    def test_delete_pre_sync_links_legacy_before_guard(self):
        self.db.execute(text("INSERT INTO pengakuan_pendapatan (id,kompensasi_id,status) VALUES ('pp1',NULL,'diakui')"))
        self.db.commit()
        def link_legacy(db):
            db.execute(text("UPDATE pengakuan_pendapatan SET kompensasi_id='k1' WHERE id='pp1'"))
        with patch("services.pendapatan_sync.lock_pendapatan"), patch("services.pendapatan_sync.sync_pendapatan", side_effect=link_legacy) as sync:
            with self.assertRaises(HTTPException) as caught:
                delete_rows(self.db, "kompensasi", {"id": "eq.k1"})
            self.assertEqual(caught.exception.status_code, 409)
            sync.assert_called_once_with(self.db)
        self.assertEqual(self.db.execute(text("SELECT COUNT(*) FROM kompensasi WHERE id='k1'")).scalar(), 1)

    def test_last_projection_invoice_cleans_only_its_empty_generated_parent(self):
        self.db.execute(text("DELETE FROM kompensasi WHERE id != 'k1'"))
        self.db.execute(text("INSERT INTO pendapatan_diterima_dimuka VALUES ('generated','ks1',100),('manual','ks1',200)"))
        self.db.execute(text("INSERT INTO pengakuan_pendapatan VALUES ('pp1','k1','proyeksi','generated')"))
        self.db.commit()
        with patch("services.pendapatan_sync.lock_pendapatan"), patch("services.pendapatan_sync.sync_pendapatan"):
            delete_rows(self.db, "kompensasi", {"id": "eq.k1"})
        self.assertEqual(self.db.execute(text("SELECT id FROM pendapatan_diterima_dimuka")).scalars().all(), ["manual"])
        self.assertEqual(self.db.execute(text("SELECT COUNT(*) FROM pengakuan_pendapatan")).scalar(), 0)

    def test_projection_delete_preserves_parent_with_manual_history(self):
        self.db.execute(text("DELETE FROM kompensasi WHERE id != 'k1'"))
        self.db.execute(text("INSERT INTO pendapatan_diterima_dimuka VALUES ('generated','ks1',100)"))
        self.db.execute(text("INSERT INTO pengakuan_pendapatan VALUES ('pp1','k1','proyeksi','generated'),('manual',NULL,'diakui','generated')"))
        self.db.commit()
        with patch("services.pendapatan_sync.lock_pendapatan"), patch("services.pendapatan_sync.sync_pendapatan"):
            delete_rows(self.db, "kompensasi", {"id": "eq.k1"})
        self.assertEqual(self.db.execute(text("SELECT id FROM pendapatan_diterima_dimuka")).scalar(), "generated")
        self.assertEqual(self.db.execute(text("SELECT id FROM pengakuan_pendapatan")).scalar(), "manual")


class LegacyScheduleMatchingTests(unittest.TestCase):
    def test_changed_unlinked_legacy_invoice_does_not_claim_manual_schedule(self):
        from datetime import date
        from services.pendapatan_sync import match_invoice_schedule
        entry = {"id": "pp1", "kompensasi_id": None, "tgl_awal": date(2026, 1, 1), "tgl_akhir": date(2026, 1, 1), "nominal": Decimal(100)}
        invoice = {"id": "k1", "tgl_jatuh_tempo": date(2026, 1, 1), "nominal": Decimal(125)}
        self.assertIsNone(match_invoice_schedule([entry], [invoice]))
        self.assertIsNone(entry["kompensasi_id"])
        self.assertEqual(entry["nominal"], Decimal(100))

    def test_matching_keeps_existing_id_and_leaves_additional_invoice_unmatched(self):
        from datetime import date
        from services.pendapatan_sync import match_invoice_schedule
        entry = {"id": "pp-stable", "kompensasi_id": None, "tgl_awal": date(2026, 1, 1), "tgl_akhir": date(2026, 1, 1), "nominal": Decimal(100)}
        invoices = [{"id": "k1", "tgl_jatuh_tempo": date(2026, 1, 1), "nominal": Decimal(100)}, {"id": "k2", "tgl_jatuh_tempo": date(2026, 2, 1), "nominal": Decimal(50)}]
        matched = match_invoice_schedule([entry], invoices)
        self.assertEqual(list(matched), ["k1"])
        self.assertEqual(matched["k1"]["id"], "pp-stable")


if __name__ == "__main__":
    unittest.main()
