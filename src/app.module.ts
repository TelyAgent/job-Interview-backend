import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { IntakeModule } from './intake/intake.module';
import { MeetingsModule } from './meetings/meetings.module';
import { MeetingRecordsModule } from './meeting-records/meeting-records.module';
import { InterviewersModule } from './interviewers/interviewers.module';
import { RubricModule } from './rubric/rubric.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    IntakeModule,
    MeetingsModule,
    MeetingRecordsModule,
    InterviewersModule,
    RubricModule,
  ],
})
export class AppModule {}
