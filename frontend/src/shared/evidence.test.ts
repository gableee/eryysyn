import { describe, expect, it } from 'vitest'
import { claimsFor, findSupportingSentence, splitSentences, supportForCitation } from './evidence'

const BP_EXCERPT =
  'Blood pressure is measured in millimetres of mercury. Normal adult blood pressure is defined as a systolic ' +
  'pressure below 120 mmHg and a diastolic pressure below 80 mmHg. Readings vary with posture and time of day.'

describe('splitSentences', () => {
  it('keeps abbreviations and decimals inside a sentence', () => {
    expect(splitSentences('Use a cuff, e.g. an adult one. Dr. Lee read 120.5 mmHg. Then i.e. twice.'))
      .toEqual(['Use a cuff, e.g. an adult one.', 'Dr. Lee read 120.5 mmHg.', 'Then i.e. twice.'])
  })

  it('text without an ending is one sentence', () => {
    expect(splitSentences('  a heading without a full stop ')).toEqual(['a heading without a full stop'])
  })
})

describe('findSupportingSentence', () => {
  it('finds the paraphrased sentence with the numbers', () => {
    const claim = 'Normal adult blood pressure is a systolic reading below 120 mmHg and a diastolic reading below 80 mmHg'
    expect(findSupportingSentence(claim, splitSentences(BP_EXCERPT))).toBe(1)
  })

  it('returns null when nothing in the excerpt supports the claim (score < 0.5)', () => {
    expect(findSupportingSentence('Volcanoes erupt when magma rises', splitSentences(BP_EXCERPT))).toBeNull()
  })

  it('returns null when two sentences match about equally (margin < 0.15): a wrong mark is worse than none', () => {
    const twins = ['The normal adult pulse is 60 to 100 beats.', 'The normal adult pulse is 60 to 100 beats at rest.']
    expect(findSupportingSentence('The normal adult pulse is 60 to 100 beats', twins)).toBeNull()
  })
})

describe('claimsFor / supportForCitation', () => {
  it('maps every [1] claim; two claims on one sentence share one mark', () => {
    const answer = 'A is true [1]. B holds [1]. A is really true [1].'
    expect(claimsFor(answer, 1)).toHaveLength(3)
    expect(supportForCitation(answer, 1, 'A is true here. B holds too.').marks)
      .toEqual([{ index: 0, claims: [0, 2] }, { index: 1, claims: [1] }])
  })

  it('ignores markers for other sources and marker-like text glued to words', () => {
    expect(claimsFor('See items[1] here. Real claim [1]. Other claim [2].', 1)).toEqual(['Real claim.'])
  })

  it('a marker after the full stop still belongs to its sentence', () => {
    expect(claimsFor('Normal is below 120. [1] Next part.', 1)).toEqual(['Normal is below 120.'])
  })

  it('real case (eval set, ethics.pdf p. 8, line breaks as extracted): both strict-liability claims find their sentence', () => {
    const excerpt = 'In the Therac-25 case, AECL could have been sued. One \nkind of legal responsibility is strict liability: if a product injures someone, then \n' +
      'manufacturer of the product can be found liable for damages in a lawsuit, even if \nthe product met all applicable safety standards and the manufacturer did nothing \n' +
      'wrong. The principle of strict liability encourages manufacturers to be careful, and it \nprovides a way to compensate victims of accidents.\nMoral responsibility. Causal, role, and legal responsibilities tend to be exclusive.'
    const answer = 'Strict liability is a kind of legal responsibility where if a product injures someone, the manufacturer can be found liable ' +
      'for damages in a lawsuit even if the product met all applicable safety standards and the manufacturer did nothing wrong [1]. ' +
      'It encourages manufacturers to be careful and compensates victims of accidents [1].'
    const s = supportForCitation(answer, 1, excerpt)
    expect(s.marks).toHaveLength(2)
    expect(s.sentences[s.marks[0].index]).toMatch(/^One \nkind of legal responsibility is strict liability/)
    expect(s.sentences[s.marks[1].index]).toMatch(/^The principle of strict liability encourages/)
  })

  it('no clear support: no marks, the sentences are still returned', () => {
    const s = supportForCitation('Volcanoes erupt [1].', 1, BP_EXCERPT)
    expect(s.marks).toEqual([])
    expect(s.sentences).toHaveLength(3)
  })
})
