/** 직무 카테고리 시드 데이터 (기획서 §3.5 지원 직무 카테고리). */
export interface JobCategorySeed {
  name: string;
  roles: string[];
}

export const JOB_CATEGORY_SEED: JobCategorySeed[] = [
  {
    name: '개발',
    roles: [
      '백엔드',
      '프론트엔드',
      '모바일(iOS/Android)',
      '데이터 엔지니어',
      'AI/ML',
      'DevOps·인프라',
      'QA',
      '보안',
    ],
  },
  { name: '기획', roles: ['서비스 기획', 'PM/PO', '전략 기획'] },
  {
    name: '디자인',
    roles: ['UX/UI', '프로덕트 디자인', 'BX·브랜드', '그래픽'],
  },
  {
    name: '마케팅',
    roles: ['퍼포먼스 마케팅', '콘텐츠 마케팅', '브랜드 마케팅', '그로스'],
  },
  { name: '영업·세일즈', roles: ['B2B 영업', '기술 영업', '해외 영업'] },
  {
    name: '데이터·분석',
    roles: ['데이터 분석가', 'BI', '데이터 사이언티스트'],
  },
  { name: '경영지원', roles: ['인사(HR)', '재무·회계', '법무', '총무'] },
  { name: '고객지원', roles: ['CS', 'CX'] },
  { name: '기타 전문', roles: ['의료', '교육', '연구', '금융'] },
];
