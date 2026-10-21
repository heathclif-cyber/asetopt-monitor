import os
import unittest
from datetime import date
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from services.pendapatan_sync import sync_pendapatan


@unittest.skipUnless(os.environ.get("TEST_DATABASE_URL"), "Requires disposable PostgreSQL TEST_DATABASE_URL")
class PendapatanSyncTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(os.environ["TEST_DATABASE_URL"])
        self.db = Session(self.engine)
        schema = "test_" + uuid4().hex
        self.db.execute(text(f'CREATE SCHEMA "{schema}"'))
        self.db.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        self.db.execute(text("""
            CREATE TABLE kerja_sama (id UUID PRIMARY KEY, nama_mitra TEXT, tgl_mulai DATE, tgl_selesai DATE);
            CREATE TABLE kompensasi (id UUID PRIMARY KEY, ks_id UUID, nominal NUMERIC, tgl_jatuh_tempo DATE, created_at TIMESTAMPTZ DEFAULT now());
            CREATE TABLE pendapatan_diterima_dimuka (id UUID PRIMARY KEY, ks_id UUID, nama_kontrak TEXT,
              total_nkm NUMERIC, total_bulan INTEGER, tgl_mulai DATE, tgl_selesai DATE,
              sudah_diakui NUMERIC DEFAULT 0, status TEXT DEFAULT 'aktif', created_at TIMESTAMPTZ DEFAULT now());
            CREATE TABLE pengakuan_pendapatan (id UUID PRIMARY KEY, pddm_id UUID, kompensasi_id UUID UNIQUE,
              periode_ke INTEGER, tgl_awal DATE, tgl_akhir DATE, nominal NUMERIC, status TEXT,
              UNIQUE(pddm_id,periode_ke));
        """))
        self.ks, self.invoice = str(uuid4()), str(uuid4())
        self.db.execute(text("INSERT INTO kerja_sama VALUES (:id,'Mitra','2026-01-01','2027-12-31')"), {"id": self.ks})
        self.db.execute(text("INSERT INTO kompensasi(id,ks_id,nominal,tgl_jatuh_tempo) VALUES (:id,:ks,100,'2026-01-01')"), {"id": self.invoice, "ks": self.ks})

    def tearDown(self):
        self.db.rollback()
        self.db.close()
        self.engine.dispose()

    def rows(self, table):
        return self.db.execute(text(f'SELECT * FROM "{table}" ORDER BY id')).mappings().all()

    def test_repeated_sync_recognizes_once_and_preserves_source_ids(self):
        sync_pendapatan(self.db, date(2026, 10, 13))
        first = dict(self.rows("pengakuan_pendapatan")[0])
        for _ in range(3):
            sync_pendapatan(self.db, date(2026, 10, 13))
        self.assertEqual(dict(self.rows("pengakuan_pendapatan")[0]), first)
        self.assertEqual(len(self.rows("pengakuan_pendapatan")), 1)
        self.assertEqual(self.rows("pendapatan_diterima_dimuka")[0]["sudah_diakui"], Decimal(100))

    def test_default_business_clock_runs_without_iana_timezone_package(self):
        sync_pendapatan(self.db)
        self.assertEqual(len(self.rows("pengakuan_pendapatan")), 1)

    def test_legacy_inflation_is_repaired_without_replacing_entries(self):
        parent, entry = str(uuid4()), str(uuid4())
        self.db.execute(text("INSERT INTO pendapatan_diterima_dimuka(id,ks_id,total_nkm,total_bulan,sudah_diakui) VALUES (:id,:ks,100,1,300)"), {"id": parent, "ks": self.ks})
        self.db.execute(text("INSERT INTO pengakuan_pendapatan(id,pddm_id,periode_ke,tgl_awal,tgl_akhir,nominal,status) VALUES (:id,:p,1,'2026-01-01','2026-01-01',100,'diakui')"), {"id": entry, "p": parent})
        sync_pendapatan(self.db, date(2026, 10, 13))
        self.assertEqual(str(self.rows("pengakuan_pendapatan")[0]["id"]), entry)
        self.assertEqual(self.rows("pendapatan_diterima_dimuka")[0]["sudah_diakui"], Decimal(100))

    def test_projection_updates_then_recognizes_once(self):
        sync_pendapatan(self.db, date(2025, 12, 31))
        entry_id = self.rows("pengakuan_pendapatan")[0]["id"]
        self.db.execute(text("UPDATE kompensasi SET nominal=125 WHERE id=:id"), {"id": self.invoice})
        sync_pendapatan(self.db, date(2025, 12, 31))
        self.assertEqual(self.rows("pengakuan_pendapatan")[0]["id"], entry_id)
        self.assertEqual(self.rows("pendapatan_diterima_dimuka")[0]["sudah_diakui"], 0)
        sync_pendapatan(self.db, date(2026, 1, 1))
        self.assertEqual(self.rows("pendapatan_diterima_dimuka")[0]["sudah_diakui"], Decimal(125))

    def test_manual_schedule_is_not_replaced_by_invoice(self):
        parent, entry = str(uuid4()), str(uuid4())
        self.db.execute(text("INSERT INTO pendapatan_diterima_dimuka(id,ks_id,total_nkm,total_bulan) VALUES (:id,:ks,100,12)"), {"id": parent, "ks": self.ks})
        self.db.execute(text("INSERT INTO pengakuan_pendapatan(id,pddm_id,periode_ke,tgl_awal,tgl_akhir,nominal,status) VALUES (:id,:p,1,'2026-01-01','2026-01-31',10,'proyeksi')"), {"id": entry, "p": parent})
        sync_pendapatan(self.db, date(2026, 10, 13))
        self.assertEqual(len(self.rows("pengakuan_pendapatan")), 1)
        self.assertEqual(self.rows("pengakuan_pendapatan")[0]["nominal"], Decimal(10))
        self.assertIsNone(self.rows("pengakuan_pendapatan")[0]["kompensasi_id"])

    def test_recognized_entry_is_immutable_even_if_source_is_changed(self):
        sync_pendapatan(self.db, date(2026, 10, 13))
        entry = dict(self.rows("pengakuan_pendapatan")[0])
        self.db.execute(text("UPDATE kompensasi SET nominal=125 WHERE id=:id"), {"id": self.invoice})
        result = sync_pendapatan(self.db, date(2026, 10, 13))
        self.assertEqual(dict(self.rows("pengakuan_pendapatan")[0]), entry)
        self.assertEqual(self.rows("pendapatan_diterima_dimuka")[0]['total_nkm'], Decimal(100))
        self.assertEqual(result['skipped_recognized_conflict_ks'], [self.ks])

    def test_duplicate_parent_history_is_preserved(self):
        for _ in range(2):
            self.db.execute(text("INSERT INTO pendapatan_diterima_dimuka(id,ks_id,total_nkm,total_bulan) VALUES (:id,:ks,100,1)"), {"id": str(uuid4()), "ks": self.ks})
        result = sync_pendapatan(self.db, date(2026, 10, 13))
        self.assertEqual(len(self.rows("pendapatan_diterima_dimuka")), 2)
        self.assertEqual(result["skipped_duplicate_ks"], [self.ks])


if __name__ == "__main__":
    unittest.main()
