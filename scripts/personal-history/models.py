"""Own-history survey preference adjustments to a fixed shared model.

API:
    CONFIGS
    fit(config, history_feedback, history_rankings, profiles, base_model)
        .predict(query_rows) -> raw utility scores

Profiles map (event_id, participant_number) to survey dictionaries. The shared
model must expose .predict(rows) on that same profile map. Feedback rows should
have Boolean wantConnect; a preprocessed numeric y in [0,1] is also accepted.
Ranking rows require percentile y in [0,1]. IDs select a person's own history
and exclude the exact previous target; IDs never enter survey features.

The caller supplies earlier history and event-time survey snapshots. Prediction
refuses ANY provided history whose event is >= a query event. This guard uses
event order, not unavailable submission timestamps. A present-day benchmark
therefore needs a synthetic query event strictly after the last training event.

Each source learns centered (observed preference - shared score) residuals.
Feedback/ranking sources without contrasting outcomes contribute exactly zero.
Repeated observations of one partner share one partner's weight. Source weights
are fixed and are not redistributed when a source is absent. Separate fits on
each chooser's own target surveys ensure other people's histories cannot alter
the personal adjustment. No query survey is used to fit a vocabulary or model.

PRIMARY excludes every earlier row about the query target before fitting the
personal adjustment. For genuinely new-target evaluation the caller should
additionally remove previously encountered pairs from its test population.
Known-pair memorization is deliberately not offered by this candidate library.
"""
from collections import Counter, defaultdict
import math

import numpy as np
from scipy.linalg import cho_factor, cho_solve
from sklearn.feature_extraction import DictVectorizer
from sklearn.preprocessing import normalize


QUESTIONS = [
    'match_disagreement_style','match_similarity_preference','humor_banter_style',
    'early_openness_comfort','conversation_initiative_preference','expression_language',
    'minimum_partner_religious_commitment','social_relationship_style',
    'attachment_1','attachment_3','attachment_4',
    *[f'lifestyle_{i}' for i in range(1,6)],
    *[f'core_values_{i}' for i in range(1,6)],
    *[f'communication_{i}' for i in range(1,6)],
    'conversational_role','conversation_depth_pref','social_battery','humor_subtype',
    'curiosity_style','intent_goal','silence_comfort',
    *[f'mbti_{i}' for i in range(1,5)],
]
ARABIC = {'أ':'A','ا':'A','ب':'B','ج':'C','د':'D'}
FOCUS = {'STUDY','CAREER','BUSINESS','FAMILY_SOCIAL','HEALTH_FITNESS',
         'CREATIVE','TRAVEL_EXPERIENCES','SELF_GROWTH','OTHER'}

# A small fixed search space, specified before looking at any held-out outcome.
CONFIGS = [
    dict(name='personal_kernel_feedback_broad',family='kernel',feedback_weight=1.,beta=4.,prior_partners=6.),
    dict(name='personal_kernel_feedback_local',family='kernel',feedback_weight=1.,beta=12.,prior_partners=6.),
    dict(name='personal_kernel_joint75',family='kernel',feedback_weight=.75,beta=6.,prior_partners=10.),
    dict(name='personal_kernel_joint50',family='kernel',feedback_weight=.5,beta=6.,prior_partners=10.),
    dict(name='personal_kernel_rankings',family='kernel',feedback_weight=0.,beta=6.,prior_partners=10.),
    dict(name='personal_ridge_feedback_light',family='ridge',feedback_weight=1.,alpha=2.,prior_partners=6.),
    dict(name='personal_ridge_feedback_shrunk',family='ridge',feedback_weight=1.,alpha=10.,prior_partners=10.),
    dict(name='personal_ridge_joint75',family='ridge',feedback_weight=.75,alpha=3.,prior_partners=10.),
    dict(name='personal_ridge_joint50',family='ridge',feedback_weight=.5,alpha=3.,prior_partners=10.),
    dict(name='personal_ridge_rankings',family='ridge',feedback_weight=0.,alpha=3.,prior_partners=10.),
]


def _tokens(profile):
    answers = profile.get('answers',{})
    result = {}
    for question in QUESTIONS:
        value = answers.get(question)
        if value is None:
            continue
        value = ARABIC.get(str(value).strip().upper(),str(value).strip().upper())
        if value in {'A','B','C','D','0','1','2','3','4','5'}:
            result[f'{question}={value}'] = 1.
    values = answers.get('match_current_focus') or []
    if isinstance(values,str):
        values = values.split(',')
    if isinstance(values,(tuple,list,set)):
        values = {str(value).strip().upper() for value in values}&FOCUS
        for value in values:
            result['focus='+value] = 1./math.sqrt(len(values))
    return result


def _profile_key(row,role):
    return int(row['event_id']),int(row[role+'_number'])


def _outcome(row,source):
    if source=='feedback' and isinstance(row.get('wantConnect'),bool):
        return float(row['wantConnect'])
    value = row.get('y')
    if isinstance(value,(int,float)) and math.isfinite(value) and 0<=value<=1:
        return float(value)
    raise ValueError('History requires Boolean wantConnect or a finite y in [0,1]')


class PersonalSource:
    """One chooser and one source; all fitted information is own prior history."""
    def __init__(self,config,rows,profiles):
        self.config = config
        self.active = False
        if len(rows)<2 or len({row['observed'] for row in rows})<2:
            return
        counts = Counter(row['target'] for row in rows)
        if len(counts)<2:
            return
        features = [_tokens(profiles[row['profile_key']]) for row in rows]
        if not any(features):
            return
        self.vectorizer = DictVectorizer(sparse=False)
        self.x = normalize(self.vectorizer.fit_transform(features))
        # One unit of total weight per unique prior partner, irrespective of
        # number of responses/phases/events recorded for that partner.
        weights = np.asarray([1./counts[row['target']] for row in rows])
        self.weights = weights/weights.sum()
        residual = np.asarray([row['observed']-row['base_score'] for row in rows])
        self.residual = residual-float(self.weights@residual)
        if np.max(np.abs(self.residual))<1e-12:
            return
        partners = len(counts)
        self.shrinkage = partners/(partners+config['prior_partners'])
        if config['family']=='ridge':
            self.mean_x = self.weights@self.x
            centered_x = self.x-self.mean_x
            sqrt_weight = np.sqrt(weights)
            weighted_x = centered_x*sqrt_weight[:,None]
            weighted_y = self.residual*sqrt_weight
            gram = weighted_x@weighted_x.T+config['alpha']*np.eye(len(rows))
            self.coefficient = weighted_x.T@cho_solve(cho_factor(gram),weighted_y)
        self.active = True

    def predict(self,profile):
        if not self.active:
            return 0.
        query = normalize(self.vectorizer.transform([_tokens(profile)]))[0]
        # No overlap with any known target-survey category gives no evidence for
        # a personal adjustment. In particular, don't extrapolate an intercept.
        if not np.any(query):
            return 0.
        if self.config['family']=='ridge':
            return float(self.shrinkage*((query-self.mean_x)@self.coefficient))
        similarity = np.clip(self.x@query,0.,1.)
        kernel = self.weights*np.exp(self.config['beta']*(similarity-1.))
        return float(self.shrinkage*(kernel@self.residual)/kernel.sum())


class PersonalModel:
    def __init__(self,config,history_feedback,history_rankings,profiles,base_model):
        self.config,self.profiles,self.base_model = dict(config),profiles,base_model
        if config['family'] not in {'kernel','ridge'}:
            raise ValueError('Unknown personal history model family')
        if not 0<=config['feedback_weight']<=1 or config['prior_partners']<0:
            raise ValueError('Invalid source weight or shrinkage prior')
        self.source_weights = {'feedback':config['feedback_weight'],'rankings':1.-config['feedback_weight']}
        sources = {'feedback':list(history_feedback),'rankings':list(history_rankings)}
        events = [int(row['event_id']) for rows in sources.values() for row in rows]
        self.last_history_event = max(events) if events else None
        self.history = defaultdict(lambda:defaultdict(list))
        self.caches = {}
        for source,rows in sources.items():
            if not rows or not self.source_weights[source]:
                continue
            base_scores = np.asarray(base_model.predict(rows),float)
            if base_scores.shape!=(len(rows),) or not np.isfinite(base_scores).all():
                raise ValueError('Base model returned invalid history predictions')
            for row,score in zip(rows,base_scores):
                chooser,target = int(row['ranker_number']),int(row['ranked_number'])
                self.history[chooser][source].append(dict(target=target,profile_key=_profile_key(row,'ranked'),
                                                         observed=_outcome(row,source),base_score=float(score)))

    def _personal_sources(self,chooser,target):
        history = self.history.get(chooser,{})
        # New targets share the same personal fit. Previously encountered
        # targets get their own exclusion fit, removing ALL own-history labels
        # about that candidate (across phases/events and both source types).
        seen = any(row['target']==target for rows in history.values() for row in rows)
        cache_key = chooser,target if seen else None
        if cache_key not in self.caches:
            self.caches[cache_key] = {
                source:PersonalSource(self.config,[row for row in rows if row['target']!=target],self.profiles)
                for source,rows in history.items()
            }
        return self.caches[cache_key]

    def predict(self,query_rows):
        rows = list(query_rows)
        if not rows:
            return np.empty(0,dtype=float)
        if self.last_history_event is not None and any(int(row['event_id'])<=self.last_history_event for row in rows):
            raise ValueError('Temporal leakage refused: every query event must be later than every supplied history event')
        base_scores = np.asarray(self.base_model.predict(rows),float)
        if base_scores.shape!=(len(rows),) or not np.isfinite(base_scores).all():
            raise ValueError('Base model returned invalid query predictions')
        result = base_scores.copy()
        for i,row in enumerate(rows):
            chooser,target = int(row['ranker_number']),int(row['ranked_number'])
            if chooser not in self.history:
                continue
            target_profile = self.profiles[_profile_key(row,'ranked')]
            adjustment = sum(self.source_weights[source]*model.predict(target_profile)
                             for source,model in self._personal_sources(chooser,target).items())
            result[i] += adjustment
        return result


def fit(config,history_feedback,history_rankings,profiles,base_model):
    """Create a personal layer; caller remains responsible for timestamp/as-of audit."""
    return PersonalModel(config,history_feedback,history_rankings,profiles,base_model)


def _selftest():
    class Base:
        def __init__(self,profiles):
            self.profiles = profiles
        def predict(self,rows):
            return np.asarray([.48+.04*(self.profiles[_profile_key(row,'ranked')]['answers'].get('social_battery')=='A') for row in rows])

    profiles = {}
    for event in [1,2,3]:
        for person in range(1,13):
            profiles[event,person] = {'answers':{'social_battery':'A' if person%2 else 'B',
                                                 'humor_subtype':'ABC'[person%3]}}
    feedback = [dict(event_id=1,ranker_number=1,ranked_number=target,wantConnect=bool(target%2)) for target in [3,4,5,6]]
    rankings = [dict(event_id=1,ranker_number=1,ranked_number=target,y=float(target%2)) for target in [3,4,5,6]]
    queries = [dict(event_id=3,ranker_number=1,ranked_number=target) for target in [7,8,9,10]]
    cold = [dict(event_id=3,ranker_number=2,ranked_number=target) for target in [7,8]]
    base = Base(profiles)
    other_feedback = [dict(event_id=2,ranker_number=2,ranked_number=target,wantConnect=not bool(target%2)) for target in [3,4,5,6]]
    other_ranking = [dict(event_id=2,ranker_number=2,ranked_number=target,y=float(not target%2)) for target in [3,4,5,6]]
    checks = 0
    for config in CONFIGS:
        model = fit(config,feedback,rankings,profiles,base)
        pred = model.predict(queries)
        assert np.isfinite(pred).all() and pred.shape==(4,)
        assert np.array_equal(model.predict(cold),base.predict(cold))
        assert np.array_equal(fit(config,[],[],profiles,base).predict(queries),base.predict(queries))
        # Another chooser's feedback and survey tokens never fit this chooser's
        # encoder, coefficients, source weights, or personal adjustment.
        second = fit(config,feedback+other_feedback,rankings+other_ranking,profiles,base)
        assert np.array_equal(pred,second.predict(queries))
        # Renumber EVERY identifier, including chooser and history targets.
        renumber = lambda n:1000+19*n
        renamed_profiles = {(event,renumber(person)):profile for (event,person),profile in profiles.items()}
        def renamed(rows):
            return [dict(row,ranker_number=renumber(row['ranker_number']),ranked_number=renumber(row['ranked_number'])) for row in rows]
        renamed_model = fit(config,renamed(feedback),renamed(rankings),renamed_profiles,Base(renamed_profiles))
        assert np.array_equal(pred,renamed_model.predict(renamed(queries)))
        # With no positive-vs-negative contrast in either source, generous-rater
        # history cannot create an adjustment from base-score variation alone.
        constants = fit(config,[dict(r,wantConnect=True) for r in feedback],[dict(r,y=1.) for r in rankings],profiles,base)
        assert np.array_equal(constants.predict(queries),base.predict(queries))
        # Removing an exact old target before adaptation agrees with manually
        # excluding every historical label about that target.
        repeated_query = [dict(event_id=3,ranker_number=1,ranked_number=3)]
        excluded = fit(config,[r for r in feedback if r['ranked_number']!=3],
                       [r for r in rankings if r['ranked_number']!=3],profiles,base)
        assert np.array_equal(model.predict(repeated_query),excluded.predict(repeated_query))
        try:
            model.predict([dict(event_id=1,ranker_number=1,ranked_number=7)])
        except ValueError:
            pass
        else:
            raise AssertionError('Temporal leakage was not rejected')
        assert model.predict([]).shape==(0,)
        checks += 9
    print(f'Passed {checks} synthetic checks across {len(CONFIGS)} fixed personal-history configurations; no real data read or fitted.')


if __name__=='__main__':
    _selftest()
