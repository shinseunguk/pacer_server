import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { ListInterviewsDto } from './dto/list-interviews.dto';
import { SubmitFeedbackDto } from './dto/session-feedback.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import {
  CompleteResult,
  CreateInterviewResult,
  InterviewDetail,
  InterviewListResult,
  InterviewsService,
  InterviewTurn,
  ResumeResult,
  SessionFeedbackView,
  SkipResult,
} from './interviews.service';
import { openSseStream, toDeltas, writeSseEvent } from './sse';

@ApiTags('interviews')
@ApiBearerAuth()
@Controller('interviews')
export class InterviewsController {
  private readonly logger = new Logger(InterviewsController.name);

  constructor(private readonly interviews: InterviewsService) {}

  @Post()
  @ApiOperation({ summary: '면접 세션 생성 (첫 질문 반환)' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInterviewDto,
  ): Promise<CreateInterviewResult> {
    return this.interviews.create(user.userId, dto);
  }

  /**
   * 답변 제출 → 다음 발화를 SSE로 스트리밍 (명세 §8).
   * 상태·권한 오류는 스트림을 열기 전에 일반 JSON 에러로 응답한다.
   */
  @Post(':id/answer')
  @ApiOperation({ summary: '답변 제출 (SSE 스트리밍 응답)' })
  async answer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAnswerDto,
    @Res() res: Response,
  ): Promise<void> {
    const turn = await this.interviews.submitAnswer(
      user.userId,
      id,
      dto.content,
    );

    openSseStream(res);
    try {
      this.streamTurn(res, turn);
    } catch (error) {
      // 헤더를 이미 보낸 뒤이므로 에러도 SSE 이벤트로 알린다.
      this.logger.error(
        `SSE 전송 실패 (session=${id}): ${error instanceof Error ? error.message : String(error)}`,
      );
      writeSseEvent(res, 'error', {
        code: 'STREAM_FAILED',
        message: '응답을 전달하지 못했어요. 다시 시도해주세요.',
      });
    } finally {
      res.end();
    }
  }

  @Post(':id/skip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '모르겠습니다 — 다음 질문으로' })
  skip(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SkipResult> {
    return this.interviews.skip(user.userId, id);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '면접 일시정지' })
  pause(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ status: string }> {
    return this.interviews.pause(user.userId, id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '이어하기 (중단 지점 컨텍스트 반환)' })
  resume(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResumeResult> {
    return this.interviews.resume(user.userId, id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '면접 종료 → 최종 리포트 생성' })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompleteResult> {
    return this.interviews.complete(user.userId, id);
  }

  @Post(':id/feedback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '리포트 만족도 제출 (👍/👎)' })
  submitFeedback(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitFeedbackDto,
  ): Promise<SessionFeedbackView> {
    return this.interviews.submitFeedback(user.userId, id, dto);
  }

  @Get()
  @ApiOperation({ summary: '내 면접 히스토리 목록' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListInterviewsDto,
  ): Promise<InterviewListResult> {
    return this.interviews.list(user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '대화 전문 재열람 (메시지 + 피드백 + 리포트)' })
  detail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InterviewDetail> {
    return this.interviews.getDetail(user.userId, id);
  }

  private streamTurn(res: Response, turn: InterviewTurn): void {
    if (turn.kind === 'interview_done') {
      writeSseEvent(res, 'interview.done', { sessionId: turn.sessionId });
      return;
    }

    const { message, progress } = turn;
    for (const delta of toDeltas(message.content ?? '')) {
      writeSseEvent(res, 'message.delta', {
        messageId: message.messageId,
        type: message.type,
        delta,
      });
    }

    writeSseEvent(res, 'message.done', {
      messageId: message.messageId,
      seq: message.seq,
      type: message.type,
      ...(message.parentId ? { parentId: message.parentId } : {}),
      progress,
    });
  }
}
