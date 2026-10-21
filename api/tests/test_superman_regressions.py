"""Offline regression tests; no connection to the database or Superman portal."""
import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ['DATABASE_URL'] = 'postgresql://test:test@127.0.0.1:1/test'

from services.superman import persist, progress, runner


class SupermanRegressionTests(unittest.TestCase):
    def test_payload_selection_for_server_and_agent(self):
        for readiness, expected in [((True, False), 'sppn'), ((False, True), 'sppb'),
                                    ((True, True), 'sppb_sppn')]:
            with self.subTest(readiness=readiness), \
                 patch.object(runner, '_sppn_sppb_readiness', return_value=readiness), \
                 patch.object(runner, 'build_sppn_payload', return_value='sppn'), \
                 patch.object(runner, 'build_sppb_pph_payload', return_value='sppb'), \
                 patch.object(runner, 'build_payload_from_kompensasi', return_value='sppb_sppn'):
                self.assertEqual(runner._build_ready_payload('k1'), expected)
        with patch.object(runner, '_sppn_sppb_readiness', return_value=(False, False)):
            with self.assertRaises(ValueError):
                runner._build_ready_payload('k1')

    def test_agent_bundle_can_continue_with_sppb_after_sppn(self):
        job = progress.SupermanJob('j1', 'k1', executor='agent')
        payload = MagicMock()
        payload.to_dict.return_value = {'jenis_form': 'sppb'}
        with patch.object(persist, 'get_kompensasi_superman', return_value='N1'), \
             patch.object(runner, 'get_job', return_value=job), \
             patch.object(runner, '_sppn_sppb_readiness', return_value=(False, True)), \
             patch.object(runner, 'build_sppb_pph_payload', return_value=payload), \
             patch.object(runner, 'resolve_support_docs_from_kompensasi', return_value=[]):
            self.assertEqual(runner.build_agent_job_bundle('j1')['payload']['jenis_form'], 'sppb')

    def test_agent_uses_sppb_form_and_ignores_unrelated_sppn(self):
        payload = SimpleNamespace(jenis_form='sppb', kompensasi_id='k1', no_invoice='inv1',
                                  no_pembayaran='pay1', no_kontrak='ks1', pph_nominal=100,
                                  dpp_pokok=0, pajak_ppn=0)
        browser_objects = [MagicMock(), MagicMock(), MagicMock()]
        with patch.object(runner, 'open_authenticated_context', return_value=browser_objects), \
             patch.object(runner, 'fill_sppb_only_draft') as sppb, \
             patch.object(runner, 'fill_sppn_draft') as sppn, \
             patch.object(runner, 'submit_sppn_draft', return_value={'sppb_no': 'B1'}), \
             patch.object(runner, '_find_todo_match', return_value={'sppb_no': 'B1', 'sppn_no': 'OTHER'}):
            result = runner.run_browser_deklarasi(SimpleNamespace(base_url='https://example.invalid'),
                                                   payload, [], persist=False)
            sppb.assert_called_once()
            sppn.assert_not_called()
            self.assertEqual(result['sppb_no'], 'B1')
            self.assertIsNone(result['sppn_no'])
            browser_objects[2].close.assert_called_once()

    def test_store_number_has_priority_over_todo(self):
        self.assertEqual(runner._coalesce_spp_numbers(
            store_sppb='B-NEW', store_sppn='N-NEW',
            match={'sppb_no': 'B-OLD', 'sppn_no': 'N-OLD'}, store_body=None),
            ('B-NEW', 'N-NEW'))

    def test_store_body_has_priority_over_todo(self):
        self.assertEqual(runner._coalesce_spp_numbers(
            store_sppb=None, store_sppn=None,
            match={'sppn_no': 'N-OLD'}, store_body={'sppn_no': 'N-NEW'}),
            (None, 'N-NEW'))

    def test_agent_and_recovery_save_typed_numbers_preserving_previous_form(self):
        row = SimpleNamespace(id='k1', superman='N1', sppn_no='N1', sppb_pph_no=None,
                              sppn_dibuat_at=None, sppb_pph_dibuat_at=None)
        pay = SimpleNamespace(superman='N1')
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = row
        db.query.return_value.filter.return_value.all.return_value = [pay]
        with patch.object(persist, 'SessionLocal', return_value=db):
            self.assertEqual(persist.save_superman_to_kompensasi('k1', ' B1 ', None), 'B1 + N1')
        self.assertEqual(row.sppb_pph_no, 'B1')
        self.assertEqual(row.sppn_no, 'N1')
        self.assertIsNotNone(row.sppb_pph_dibuat_at)
        self.assertEqual(pay.superman, 'B1 + N1')
        db.commit.assert_called_once()
        db.close.assert_called_once()

    def test_failed_agent_result_is_not_saved_or_reported_as_success(self):
        job_id = progress.create_job('k1', executor='agent')
        try:
            with patch.object(runner, 'save_superman_to_kompensasi') as save:
                result = runner.agent_complete_job(job_id, {'ok': False, 'message': 'Ditolak', 'sppn_no': 'N1'})
                save.assert_not_called()
            self.assertEqual(result['status'], 'failed')
            self.assertEqual(result['error'], 'Ditolak')
        finally:
            progress._jobs.pop(job_id, None)


if __name__ == '__main__':
    unittest.main()
