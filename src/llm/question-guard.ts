/**
 * 생성된 질문의 서버측 후검증 (프롬프트 설계 §2 · §9 "가드레일 이중화").
 *
 * 프롬프트에 금지 규칙을 넣어도 공고·자소서 원문에 끌려가 새어나올 수 있다.
 * 채용절차법상 금지된 질문이 모의 면접에 뜨면 그 관행을 학습시키는 꼴이고,
 * 스크린샷 한 장으로 신뢰가 무너진다. 프롬프트를 믿지 않고 한 번 더 거른다.
 */

export type ProhibitedTopic =
  | 'age'
  | 'gender'
  | 'marriage'
  | 'family'
  | 'religion'
  | 'origin'
  | 'appearance'
  | 'politics'
  | 'health';

interface TopicRule {
  topic: ProhibitedTopic;
  patterns: RegExp[];
}

/**
 * 규칙은 **질문 문맥**까지 함께 본다. "나이"라는 단어만으로 거르면
 * "서비스 나이대별 이탈률을 어떻게 분석했나요?" 같은 정상 질문이 걸린다.
 */
const RULES: TopicRule[] = [
  {
    topic: 'age',
    patterns: [
      /(나이|연세|생년월일|몇\s*살)[가이는을를]?\s*(어떻게|얼마|몇|되[시세]|말씀|알려)/,
      /(만\s*)?몇\s*살(이|인가|입니까|이세요|이신가)/,
      /본인.{0,6}(나이|생년)/,
    ],
  },
  {
    topic: 'gender',
    patterns: [
      /(성별|남성|여성)(이|인지|이신가|을|를)?\s*(어떻|무엇|말씀|알려|여쭤)/,
    ],
  },
  {
    topic: 'marriage',
    patterns: [
      /(결혼|기혼|미혼|배우자|약혼)/,
      /(출산|임신|육아\s*휴직)\s*(계획|의향|예정|생각)/,
    ],
  },
  {
    topic: 'family',
    patterns: [
      // 가족의 속성(직업·재산·학력)을 묻는 형태만 잡는다.
      /(가족|부모|아버지|어머니|형제|자매|자녀)(님|분)?[들]?\s*(의)?\s*(직업|재산|학력|소득|연봉|나이|건강)/,
      /가족\s*관계/,
      /(부모|아버지|어머니)(님|분)?[은는이가]?\s*(무엇|어떤|어떻게|뭐)/,
    ],
  },
  {
    topic: 'religion',
    patterns: [/(종교|신앙|교회|성당|절에|불교|기독교|천주교)/],
  },
  {
    topic: 'origin',
    patterns: [
      /(출신\s*(지역|지|고향|학교|대학)|본적|고향)/,
      /어디\s*(출신|에서\s*태어)/,
    ],
  },
  {
    topic: 'appearance',
    patterns: [/(외모|키가|몸무게|체중|생김새|인상착의)/],
  },
  {
    topic: 'politics',
    patterns: [/(정치\s*(성향|색|관)|지지\s*(정당|후보)|투표)/],
  },
  {
    topic: 'health',
    patterns: [/(병력|지병|장애\s*(여부|등급)|정신\s*질환|복용\s*중인\s*약)/],
  },
];

/** 금지 주제에 걸리면 그 주제를, 아니면 null. */
export function detectProhibitedTopic(
  question: string,
): ProhibitedTopic | null {
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(question))) {
      return rule.topic;
    }
  }
  return null;
}

export function isProhibitedQuestion(question: string): boolean {
  return detectProhibitedTopic(question) !== null;
}
