import {
  getLegalDocument,
  LEGAL_DOCUMENT_TYPES,
  listLegalDocuments,
} from './legal.documents';

describe('legal documents', () => {
  it('약관·처리방침 두 문서를 제공한다', () => {
    expect(listLegalDocuments().map((doc) => doc.type)).toEqual([
      'terms',
      'privacy',
    ]);
  });

  it.each(LEGAL_DOCUMENT_TYPES)(
    '%s 문서는 버전·시행일·본문을 갖는다',
    (type) => {
      const doc = getLegalDocument(type);

      expect(doc.title).not.toHaveLength(0);
      expect(doc.version).toMatch(/^\d+\.\d+$/);
      expect(doc.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.sections.length).toBeGreaterThan(0);

      for (const section of doc.sections) {
        expect(section.heading).not.toHaveLength(0);
        expect(section.body).not.toHaveLength(0);
      }
    },
  );

  it('처리방침은 LLM 위탁·국외이전과 파기 기준을 담는다', () => {
    const bodies = getLegalDocument('privacy')
      .sections.map((section) => `${section.heading}\n${section.body}`)
      .join('\n');

    expect(bodies).toContain('국외');
    expect(bodies).toContain('위탁');
    expect(bodies).toContain('탈퇴');
    expect(bodies).toContain('파기');
  });
});
