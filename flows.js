/* Sehat Sathi v1 — triage decision trees.
   *** SAMPLE CONTENT — MUST BE REVIEWED BY THE MBBS CO-FOUNDER ***
   Every flow starts with red-flag screening. Results are triage levels only.
   Node: { q, list?, opts:[{t, go}] }  go = nodeId | "R:<red|yellow|green>:<adviceKey>" */
const FLOWS = {
  fever: {
    labelKey: 'flowFever', subKey: 'flowFeverSub', icon: '🌡️', start: 'redflags',
    nodes: {
      redflags: { q: 'q_redflag', list: 'redflag_list', opts: [
        { t: 'yes', go: 'R:red:adv_fever_red' },
        { t: 'no',  go: 'fever_days' },
      ]},
      fever_days: { q: 'q_fever_days', opts: [
        { t: 'opt_days_short', go: 'fever_other' },
        { t: 'opt_days_long',  go: 'R:yellow:adv_fever_long' },
      ]},
      fever_other: { q: 'q_fever_other', opts: [
        { t: 'opt_only_fever', go: 'R:green:adv_fever_mild' },
        { t: 'opt_cold',       go: 'R:green:adv_fever_cold' },
        { t: 'opt_vomit',      go: 'R:yellow:adv_fever_gi' },
      ]},
    }
  },
  pregnancy: {
    labelKey: 'flowPreg', subKey: 'flowPregSub', icon: '🤰', start: 'preg_redflags',
    nodes: {
      preg_redflags: { q: 'q_preg_redflag', list: 'preg_redflag_list', opts: [
        { t: 'yes', go: 'R:red:adv_preg_red' },
        { t: 'no',  go: 'preg_month' },
      ]},
      preg_month: { q: 'q_preg_month', opts: [
        { t: 'opt_m1', go: 'R:yellow:adv_preg_routine' },
        { t: 'opt_m2', go: 'R:yellow:adv_preg_routine' },
        { t: 'opt_m3', go: 'R:yellow:adv_preg_routine' },
      ]},
    }
  },
};
