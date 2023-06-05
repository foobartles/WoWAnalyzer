import SPELLS from 'common/SPELLS/evoker';
import EventOrderNormalizer, { EventOrder } from 'parser/core/EventOrderNormalizer';
import { EventType } from 'parser/core/Events';
import { Options } from 'parser/core/Module';

const EVENT_ORDERS: EventOrder[] = [
  {
    beforeEventId: SPELLS.SHATTERING_STAR.id,
    beforeEventType: EventType.Cast,
    afterEventId: SPELLS.ESSENCE_BURST_DEV_BUFF.id,
    afterEventType: [EventType.ApplyBuffStack, EventType.ApplyBuff],
    bufferMs: 50,
    anyTarget: true,
  },
];

/**
 * The applybuff from Arcane Vigor is logged before the cast of Shattering Star
 * This normalizes events so that the Shattering Star cast always comes before the EB buff
 **/
class EssenceBurstNormalizer extends EventOrderNormalizer {
  constructor(options: Options) {
    super(options, EVENT_ORDERS);
  }
}

export default EssenceBurstNormalizer;
