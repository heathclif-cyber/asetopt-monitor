import os
import unittest
from datetime import date

from fastapi import HTTPException
from sqlalchemy import text

from routers.r_notifikasi import SPIssue, issue_sp
from tests import test_pendapatan_sync as income_tests


@unittest.skipUnless(os.environ.get("TEST_DATABASE_URL"), "Requires disposable PostgreSQL TEST_DATABASE_URL")
class NotifikasiSPTests(unittest.TestCase):
    def setUp(self):
        self.fixture = income_tests.PendapatanSyncTests()
        self.fixture.setUp()
        self.db = self.fixture.db
        self.ks, self.invoice = self.fixture.ks, self.fixture.invoice
        self.db.execute(text("""
            ALTER TABLE kerja_sama ADD COLUMN status TEXT DEFAULT 'aktif';
            ALTER TABLE kompensasi ADD COLUMN total_tagihan NUMERIC DEFAULT 100;
            ALTER TABLE kompensasi ADD COLUMN pengurang NUMERIC DEFAULT 0;
            ALTER TABLE kompensasi ADD COLUMN persen_denda_per_hari NUMERIC DEFAULT 0.1;
            CREATE TABLE pembayaran(id UUID,kompensasi_id UUID,nominal_bayar NUMERIC);
            CREATE TABLE surat_peringatan(id UUID PRIMARY KEY,ks_id UUID,kompensasi_id UUID,
              jenis TEXT,tgl_terbit DATE,tgl_deadline DATE,status TEXT);
        """))

    def tearDown(self):
        self.fixture.tearDown()

    def issue(self, kind, today):
        return issue_sp(self.db, SPIssue(ks_id=self.ks, kompensasi_id=self.invoice, jenis=kind), today)

    def test_configured_rate_controls_first_sp_boundary(self):
        self.db.execute(text("UPDATE kompensasi SET persen_denda_per_hari=0.2"))
        with self.assertRaises(HTTPException):
            self.issue("SP1", date(2026, 1, 25))
        self.issue("SP1", date(2026, 1, 26))
        self.assertEqual(self.db.execute(text("SELECT status FROM kerja_sama")).scalar(), "sp1")

    def test_escalation_uses_actual_issue_date_and_cannot_skip_levels(self):
        self.issue("SP1", date(2026, 4, 1))
        with self.assertRaises(HTTPException):
            self.issue("SP2", date(2026, 4, 14))
        with self.assertRaises(HTTPException):
            self.issue("SP3", date(2026, 4, 15))
        self.issue("SP2", date(2026, 4, 15))
        self.assertEqual(self.db.execute(text("SELECT COUNT(*) FROM surat_peringatan WHERE status='aktif'")).scalar(), 1)

    def test_paid_invoice_cannot_receive_sp(self):
        self.db.execute(text("INSERT INTO pembayaran(kompensasi_id,nominal_bayar) VALUES (:id,100)"), {"id": self.invoice})
        with self.assertRaises(HTTPException):
            self.issue("SP1", date(2026, 10, 13))
        self.assertEqual(self.db.execute(text("SELECT COUNT(*) FROM surat_peringatan")).scalar(), 0)


if __name__ == "__main__":
    unittest.main()
