/**
 * 약관·개인정보 처리방침 원문 (앱 온보딩 동의 화면에서 노출).
 *
 * 기획서 §6 "처리방침·이용약관 문서 별도 작성, 앱 내 접근 가능하게" 이행.
 * 클로즈드 베타용 초안이며, 정식 출시 전 법률 검토와 사업자 정보 확정이 필요하다.
 */

export const LEGAL_DOCUMENT_TYPES = ['terms', 'privacy'] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

export interface LegalSection {
  heading: string;
  body: string;
}

export interface LegalDocument {
  type: LegalDocumentType;
  title: string;
  /** 문서 개정 시 올린다. 동의 이력과 대조할 수 있게 앱에도 내려보낸다. */
  version: string;
  /** 시행일 (YYYY-MM-DD) */
  effectiveDate: string;
  sections: LegalSection[];
}

const CONTACT = '페이서 운영팀 (support@pacer.app)';

const TERMS: LegalDocument = {
  type: 'terms',
  title: '서비스 이용약관',
  version: '0.1',
  effectiveDate: '2026-08-15',
  sections: [
    {
      heading: '제1조 (목적)',
      body: '이 약관은 페이서(이하 "서비스")가 제공하는 AI 모의 면접 서비스의 이용 조건과 절차, 이용자와 운영자의 권리·의무를 정하는 것을 목적으로 합니다.',
    },
    {
      heading: '제2조 (서비스의 내용)',
      body: '서비스는 이용자가 입력한 채용 공고·경력 정보를 바탕으로 AI가 면접 질문을 생성하고, 대화형 모의 면접 진행과 평가 리포트를 제공합니다. 평가 결과는 연습을 위한 참고 자료이며, 실제 채용 결과를 보장하거나 예측하지 않습니다.',
    },
    {
      heading: '제3조 (이용 계약의 성립)',
      body: '이용자가 소셜 계정으로 로그인하고 필수 약관에 동의하면 이용 계약이 성립합니다. 만 14세 미만은 서비스를 이용할 수 없습니다.',
    },
    {
      heading: '제4조 (이용자의 의무)',
      body: '이용자는 타인의 개인정보나 권리를 침해하는 내용, 불법적인 내용을 입력해서는 안 됩니다. 서비스의 정상적인 운영을 방해하는 자동화된 접근, 과도한 요청을 해서는 안 됩니다.',
    },
    {
      heading: '제5조 (이용 제한)',
      body: '운영자는 이용자가 제4조를 위반한 경우 사전 통지 없이 이용을 제한하거나 계약을 해지할 수 있습니다.',
    },
    {
      heading: '제6조 (무료 이용과 이용 한도)',
      body: '클로즈드 베타 기간에는 서비스를 무료로 제공하며, 서버 비용 관리를 위해 1일 질문 수 등 이용 한도를 둘 수 있습니다. 유료 상품은 정식 출시 시 별도 고지 후 도입합니다.',
    },
    {
      heading: '제7조 (AI 생성물의 한계)',
      body: 'AI가 생성한 질문·평가·모범답안은 오류나 편향을 포함할 수 있습니다. 운영자는 생성물의 정확성을 보증하지 않으며, 이용자가 이를 신뢰해 내린 판단의 결과에 대해 책임지지 않습니다.',
    },
    {
      heading: '제8조 (서비스의 변경·중단)',
      body: '운영자는 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 중대한 변경은 앱 내 공지로 사전에 알립니다.',
    },
    {
      heading: '제9조 (문의)',
      body: `서비스 이용과 관련한 문의는 ${CONTACT} 으로 연락해 주세요.`,
    },
  ],
};

const PRIVACY: LegalDocument = {
  type: 'privacy',
  title: '개인정보 처리방침',
  version: '0.1',
  effectiveDate: '2026-08-15',
  sections: [
    {
      heading: '1. 수집하는 개인정보 항목',
      body: '① 소셜 로그인 정보: 소셜 제공자 식별자, 닉네임, 이메일(제공에 동의한 경우에 한함)\n② 이용자가 직접 입력한 정보: 채용 공고 내용, 경력·자기소개 등 지원자 정보, 면접 답변\n③ 자동 생성 정보: 면접 질문·평가 기록, 이용 일시, 일일 사용량',
    },
    {
      heading: '2. 개인정보의 이용 목적',
      body: '회원 식별과 로그인 유지, 맞춤 면접 질문 생성과 평가 리포트 제공, 이용 한도 관리, 서비스 품질 개선과 오류 대응에 이용합니다.',
    },
    {
      heading: '3. AI 처리 위탁 및 국외 이전',
      body: '맞춤 질문 생성과 평가를 위해 이용자가 입력한 채용 공고·지원자 정보·면접 답변을 AI 모델 제공사에 전송합니다. 수탁자와 처리 국가는 연동 시점에 본 방침에 명시하며, 위탁 범위는 질문 생성·평가 처리에 한정됩니다. 이 처리에 동의하지 않으면 면접 기능을 이용할 수 없습니다.',
    },
    {
      heading: '4. 보유 기간과 파기',
      body: '회원 탈퇴 시 계정과 면접 기록을 지체 없이 파기합니다(파기 배치는 매일 실행). 채용 공고 원문·자기소개 등 민감도가 높은 원문은 입력일로부터 보관 기간(기본 90일)이 지나면 별도 요청 없이 삭제합니다. 법령에 따라 보존이 필요한 정보는 해당 기간 동안 분리 보관합니다.',
    },
    {
      heading: '5. 개인정보의 제3자 제공',
      body: '제3조의 AI 처리 위탁을 제외하고, 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.',
    },
    {
      heading: '6. 이용자의 권리',
      body: '이용자는 언제든지 앱에서 자신의 정보를 조회·수정하고, 회원 탈퇴를 통해 개인정보의 삭제를 요청할 수 있습니다. 열람·정정·삭제 요청은 문의처를 통해서도 가능합니다.',
    },
    {
      heading: '7. 안전성 확보 조치',
      body: '전송 구간 암호화, 인증 토큰의 기기 보안 저장소 보관, 접근 권한 최소화, 민감 정보의 로그 미출력, 요청 빈도 제한 등의 조치를 적용합니다.',
    },
    {
      heading: '8. 문의처',
      body: `개인정보 관련 문의와 권리 행사 요청은 ${CONTACT} 으로 접수해 주세요.`,
    },
  ],
};

const DOCUMENTS: Record<LegalDocumentType, LegalDocument> = {
  terms: TERMS,
  privacy: PRIVACY,
};

export function getLegalDocument(type: LegalDocumentType): LegalDocument {
  return DOCUMENTS[type];
}

export function listLegalDocuments(): LegalDocument[] {
  return LEGAL_DOCUMENT_TYPES.map((type) => DOCUMENTS[type]);
}
