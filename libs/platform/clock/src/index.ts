export type { Clock } from './lib/clock';
export { SystemClock } from './lib/system-clock';
export { FixedClock } from './lib/fixed-clock';
export { CLOCK, ClockModule } from './lib/clock.module';

// DÉMONSTRATION US-003 : violation volontaire d'une frontière d'architecture.
export { PrismaService as DemoLeak } from '@trame/api/database';
