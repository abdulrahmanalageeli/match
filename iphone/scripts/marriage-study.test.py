"""Synthetic protocol checks. No member data or empirical performance estimates."""
import runpy
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

study = runpy.run_path(str(Path(__file__).with_name('marriage-study.py')))
start = datetime(2028,1,1,tzinfo=timezone.utc)
cutoff = start + timedelta(days=400)
lock = cutoff + timedelta(days=500)


def pair(i, date):
    return dict(request_id=str(i),requester_group=f'a{i}',recipient_group=f'b{i}',connected_at=date.isoformat(),
                closed_at=None,practical_score=75,personality_score=None if i%3==0 else 65,
                practical_topics=[{'id':'children_plan','status':'aligned'}],
                requester_potential='yes', recipient_potential='no' if i%2 else 'yes')


class StudyTest(unittest.TestCase):
    def test_full_questionnaire_model_is_reciprocal(self):
        rows = [pair(i,start if i<6 else cutoff) for i in range(12)]
        for row in rows:
            row['requester_traits'] = {item['id']:'C' for item in study['ITEMS']}
            row['requester_traits']['partner_stability'] = 'E'
            row['recipient_traits'] = {item['id']:('E' if item['reverse'] else 'A') for item in study['ITEMS']}
        first=rows[0]
        vector = study['detail_features'](first)
        values = dict(zip(study['DETAIL'],vector))
        self.assertEqual(values['stability_preference_coverage'],0.5)
        self.assertEqual(values['stability_worst_gap'],1)
        self.assertEqual(values['stability_self_difference'],0.5)
        self.assertEqual(vector,study['detail_features'](dict(first,requester_traits=first['recipient_traits'],recipient_traits=first['requester_traits'])))
        self.assertIn('exploratory_topic_and_trait_detail',study['evaluate'](rows,{},'week',cutoff,lock,True)['metrics'])

    def test_temporal_cut_and_unknowns(self):
        rows = [pair(i,start if i<8 else cutoff) for i in range(32)]
        rows[0]['recipient_potential']='too_early'
        rows[8]['recipient_group']=rows[0]['requester_group']
        rows[9]['recipient_potential']=None
        rows[10]['closed_at']=(cutoff+timedelta(days=3)).isoformat()
        rows[7]['connected_at']=(cutoff-timedelta(days=4)).isoformat()
        r=study['evaluate'](rows,{},'week',cutoff,lock)
        for key in ['train_unknown','test_returning_excluded','test_unknown','closed_before_week_window','straddles_cutoff']:
            self.assertEqual(r['flow'][key],1)
        self.assertEqual(r['flow']['test_resolved'],21)
        self.assertIsNotNone(r['paired_uncertainty']['ci95'])
        self.assertLessEqual(*r['gain_bounds_including_unknowns'])
        self.assertEqual(len(r['metrics']),4)

    def test_marriage_followup_uses_original_cohort(self):
        rows=[pair(i,start if i<4 else cutoff) for i in range(7)]
        reports={}
        for i,row in enumerate(rows):
            date=study['instant'](row['connected_at'])
            row['closed_at']=(date+timedelta(days=1)).isoformat()
            for side in ('requester','recipient'):
                if i==5 and side=='recipient':
                    continue
                vote='yes' if i%2==0 else 'no'
                reports[(str(i),side)]=(date+timedelta(days=370),'no' if i==6 and side=='requester' else vote)
        r=study['evaluate'](rows,reports,'marriage365',cutoff,lock)
        self.assertEqual(r['training_outcomes'],{0:2,1:2})
        self.assertEqual(r['test_outcomes'],{1:1})
        self.assertEqual(r['flow']['test_unknown'],2)
        self.assertIsNone(r['paired_uncertainty']['ci95'])
        reports[('0','recipient')]=(start,'yes')
        with self.assertRaisesRegex(ValueError,'outside'):
            study['evaluate'](rows,reports,'marriage365',cutoff,lock)


if __name__=='__main__':
    unittest.main()
