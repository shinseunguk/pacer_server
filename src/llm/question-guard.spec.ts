import { detectProhibitedTopic } from './question-guard';

describe('detectProhibitedTopic', () => {
  describe('금지 질문을 걸러낸다', () => {
    const prohibited: [string, string][] = [
      ['age', '실례지만 나이가 어떻게 되시나요?'],
      ['age', '올해 몇 살이신가요?'],
      ['marriage', '결혼은 하셨나요?'],
      ['marriage', '출산 계획이 있으신가요?'],
      ['family', '가족 관계가 어떻게 되시나요?'],
      ['family', '부모님 직업은 무엇인가요?'],
      ['religion', '종교가 있으신가요?'],
      ['origin', '출신 지역이 어디신가요?'],
      ['origin', '어디 출신이신가요?'],
      ['appearance', '외모 관리는 어떻게 하시나요?'],
      ['politics', '정치 성향을 말씀해주세요.'],
      ['health', '지병이나 병력이 있으신가요?'],
    ];

    it.each(prohibited)('%s: "%s"', (topic, question) => {
      expect(detectProhibitedTopic(question)).toBe(topic);
    });
  });

  describe('정상 직무 질문은 통과시킨다', () => {
    const allowed = [
      '결제 API의 응답 지연을 줄인 경험을 말씀해주세요.',
      '서비스 이용자의 나이대별 이탈률을 어떻게 분석하셨나요?',
      '가족 단위 고객을 위한 기능을 설계한다면 어떤 점을 고려하시겠어요?',
      '트래픽이 몰릴 때 어떤 순서로 원인을 좁혀 가시나요?',
      '팀에서 의견이 갈렸을 때 어떻게 설득하셨나요?',
      '본인이 직접 결정한 지점과 그 근거를 설명해주세요.',
      '자기소개 부탁드립니다.',
      '지원하신 이유를 말씀해주세요.',
    ];

    it.each(allowed)('"%s"', (question) => {
      expect(detectProhibitedTopic(question)).toBeNull();
    });
  });

  it('단어만 스쳐도 걸리지는 않는다 — 오탐이 정상 질문을 막으면 안 된다', () => {
    // "나이"가 들어갔지만 지원자에게 묻는 질문이 아니다.
    expect(
      detectProhibitedTopic('타겟 연령대를 나이 기준으로 어떻게 나누셨나요?'),
    ).toBeNull();
  });
});
