import { Controller, Get, HttpStatus, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { AppException } from '../common/exceptions/app.exception';
import {
  getLegalDocument,
  LEGAL_DOCUMENT_TYPES,
  LegalDocument,
  LegalDocumentType,
  listLegalDocuments,
} from './legal.documents';

/** 약관·처리방침은 가입 전에도 읽을 수 있어야 하므로 공개한다. */
@ApiTags('legal')
@Controller('legal')
export class LegalController {
  @Public()
  @Get()
  @ApiOperation({ summary: '약관·처리방침 목록' })
  list(): LegalDocument[] {
    return listLegalDocuments();
  }

  @Public()
  @Get(':type')
  @ApiOperation({ summary: '약관·처리방침 원문 조회' })
  @ApiParam({ name: 'type', enum: LEGAL_DOCUMENT_TYPES })
  get(@Param('type') type: string): LegalDocument {
    if (!isLegalType(type)) {
      throw new AppException(
        'LEGAL_DOCUMENT_NOT_FOUND',
        '문서를 찾을 수 없어요.',
        HttpStatus.NOT_FOUND,
      );
    }
    return getLegalDocument(type);
  }
}

function isLegalType(value: string): value is LegalDocumentType {
  return (LEGAL_DOCUMENT_TYPES as readonly string[]).includes(value);
}
