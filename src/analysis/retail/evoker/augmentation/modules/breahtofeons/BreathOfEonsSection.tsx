import React, { useState } from 'react';
import {
  BreathOfEonsWindows,
  BreathWindowPerformance,
  SpellTracker,
} from './BreathOfEonsRotational';
import { SubSection } from 'interface/guide';
import { SpellLink, TooltipElement } from 'interface';
import { formatDuration, formatNumber } from 'common/format';
import BreathOfEonsGraph from './BreathOfEonsGraph';
import TALENTS from 'common/TALENTS/evoker';
import SPELLS from 'common/SPELLS/evoker';
import PassFailBar from 'interface/guide/components/PassFailBar';
import './Section.scss';
import { t } from '@lingui/macro';
import LazyLoadGuideSection from '../features/BuffTargetHelper/LazyLoadGuideSection';
import { blacklist } from '../features/BuffTargetHelper/BuffTargetHelper';
import { fetchEvents } from 'common/fetchWclApi';
import CombatLogParser from '../../CombatLogParser';
import DisintegratePlot, {
  DataSeries,
  GraphData,
  generateGraphData,
} from 'analysis/retail/evoker/devastation/modules/abilities/DisintegrateGraph';

type Props = {
  windows: BreathOfEonsWindows[];
  fightStartTime: number;
  fightEndTime: number;
  ebonMightCount: SpellTracker[];
  shiftingSandsCount: SpellTracker[];
  owner: CombatLogParser;
};
const damageTables: {
  table: any[];
  start: number;
  end: number;
}[] = [];
//const damageTables: any[][] = [];

const BreathOfEonsSection: React.FC<Props> = ({
  windows,
  fightStartTime,
  fightEndTime,
  ebonMightCount,
  shiftingSandsCount,
  owner,
}) => {
  /** Logic for handling display of windows */
  const [currentWindowIndex, setCurrentWindowIndex] = useState(0);

  const goToNextWindow = () => {
    setCurrentWindowIndex((prevIndex) => (prevIndex + 1) % windows.length);
  };
  const goToPrevWindow = () => {
    setCurrentWindowIndex((prevIndex) => (prevIndex - 1 + windows.length) % windows.length);
  };

  const currentWindow = windows[currentWindowIndex];
  let breathPerformance!: BreathWindowPerformance;
  if (currentWindow) {
    breathPerformance = currentWindow.breathPerformance;
  }

  /** Generate filter based on black list and whitelist
   * For now we only look at the players who were buffed
   * during breath */
  function getFilter(window: BreathOfEonsWindows) {
    console.log(window.breathPerformance.buffedPlayers);
    //const playerNames = ['Olgey', 'Yuette', 'Dérp', 'Dolanpepe'];
    const playerNames = Array.from(window.breathPerformance.buffedPlayers.keys());
    const nameFilter = playerNames.map((name) => `"${name}"`).join(', ');

    /** Blacklist is set in BuffTargetHelper module */
    const abilityFilter = blacklist.map((id) => `${id}`).join(', ');

    const filter = `type = "damage" 
    AND not ability.id in (${abilityFilter}) 
    AND (source.name in (${nameFilter}, "${owner.selectedCombatant.name}") OR source.owner.name in (${nameFilter})) 
    AND (target.id != source.id)`;
    console.log(filter);
    return filter;
  }

  const buffer = 4000;

  async function loadData() {
    /** High maxPage allowances needed otherwise it breaks
     * If we ever desire to find optimal buff targets for Breath windows
     * this would prolly get out of hand unless we split up the requests.
     * But that is not the current goal for this module soooo : ) */
    for (const window of windows) {
      const startTime =
        window.start - buffer > fightStartTime ? window.start - buffer : fightStartTime;
      const endTime = window.end + buffer < fightEndTime ? window.end + buffer : fightEndTime;
      const windowEvents = await fetchEvents(
        owner.report.code,
        startTime,
        endTime,
        undefined,
        getFilter(window),
        10,
      );
      damageTables.push({
        table: windowEvents,
        start: window.start,
        end: window.end,
      });
    }
  }

  function findOptimalWindow() {
    console.log(damageTables);
    const graphData: GraphData[] = [];

    let index = 0;
    for (const table of damageTables) {
      const damageWindows = [];
      const recentDamage: any[] = [];
      let totalDamage = 0; // Initialize total damage accumulator
      let damageInRange = 0; // Initialize damage within the current window

      const damageByOwner: { [ownerName: number]: number } = {}; // Object to store damage by owner
      if (!windows[index]) {
        continue;
      }
      const breathStart = windows[index].start;
      const breathEnd = windows[index].end;
      const breathLength = breathEnd - breathStart;
      console.log(index);
      for (const event of table.table) {
        recentDamage.push(event);
        totalDamage += event.amount + (event.absorbed ?? 0); // Accumulate total damage

        // Calculate the sum only for events within the current window
        if (event.timestamp >= breathStart && event.timestamp <= breathEnd) {
          if (event.subtractsFromSupportedActor) {
            damageInRange -= event.amount + (event.absorbed ?? 0);
            damageByOwner[event.sourceID] = (damageByOwner[event.sourceID] || 0) - event.amount;
          } else {
            damageInRange += event.amount + (event.absorbed ?? 0);
            damageByOwner[event.sourceID] = (damageByOwner[event.sourceID] || 0) + event.amount;
          }
        }

        while (
          recentDamage[recentDamage.length - 1].timestamp - recentDamage[0].timestamp >=
          breathLength
        ) {
          // Calculate the sum only for events within the current window
          const eventsWithinWindow = recentDamage.filter(
            (e) =>
              e.timestamp >= recentDamage[0].timestamp &&
              e.timestamp <= recentDamage[0].timestamp + breathLength,
          );
          const currentWindowSum = eventsWithinWindow.reduce((acc, e) => {
            if (e.subtractsFromSupportedActor) {
              return acc - e.amount - (e.absorbed ?? 0);
            } else {
              return acc + e.amount + (e.absorbed ?? 0);
            }
          }, 0);

          damageWindows.push({
            start: recentDamage[0].timestamp,
            end: recentDamage[0].timestamp + breathLength,
            sum: currentWindowSum,
            startFormat: formatDuration(recentDamage[0].timestamp - fightStartTime),
            endFormat: formatDuration(recentDamage[0].timestamp + breathLength - fightStartTime),
          });
          recentDamage.shift();
        }
      }

      index += 1;

      const top5Windows = damageWindows.sort((a, b) => b.sum - a.sum).slice(0, 5);

      console.log('Top 5 Windows:', top5Windows);
      console.log('Total Damage:', totalDamage); // Log total damage
      console.log('Damage within current window:', damageInRange);
      console.log('start: ', formatDuration(currentWindow.start - fightStartTime));
      console.log('end: ', formatDuration(currentWindow.end - fightStartTime));
      console.log('Damage by Owner:', damageByOwner); // Log damage by owner

      const dataSeries: DataSeries[] = [
        {
          spellTracker: [
            {
              timestamp: breathStart,
              count: 1,
            },
            {
              timestamp: breathEnd,
              count: 0,
            },
          ],
          type: 'area',
          color: '#736F4E',
          strokeWidth: 5,
        },
        {
          spellTracker: [
            {
              timestamp: top5Windows[0].start,
              count: 1 * (top5Windows[0].sum / damageInRange),
            },
            {
              timestamp: top5Windows[0].end,
              count: 0,
            },
          ],
          type: 'area',
          color: '#4C78A8',
          strokeWidth: 5,
        },
      ];
      const newGraphData = generateGraphData(
        dataSeries,
        breathStart - buffer,
        breathEnd + buffer,
        'Breath Window',
      );
      graphData.push(newGraphData);
    }

    return (
      <div>
        <DisintegratePlot
          fightStartTime={fightStartTime}
          fightEndTime={fightEndTime}
          graphData={graphData}
          yAxisName="Damage Ratio"
        />
      </div>
    );
  }

  return (
    <SubSection title="Breath of Eons">
      <div>
        <p>
          <SpellLink spell={TALENTS.BREATH_OF_EONS_TALENT} /> is a powerful cooldown that should be
          used along side your allies cooldowns, since it's a major damage amplifier.{' '}
          <SpellLink spell={TALENTS.BREATH_OF_EONS_TALENT} /> will replicate damage done by your{' '}
          <SpellLink spell={TALENTS.EBON_MIGHT_TALENT} /> targets, it is therefore important to
          maintain 100% uptime on <SpellLink spell={TALENTS.EBON_MIGHT_TALENT} /> during your{' '}
          <SpellLink spell={TALENTS.BREATH_OF_EONS_TALENT} /> windows.
          <br />
        </p>
        {(breathPerformance && (
          <div>
            {breathPerformance.timeskipTalented && (
              <p>
                With <SpellLink spell={TALENTS.TIME_SKIP_TALENT} /> talented, you should aim to use{' '}
                <SpellLink spell={TALENTS.TIME_SKIP_TALENT} /> alongside every other{' '}
                <SpellLink spell={TALENTS.BREATH_OF_EONS_TALENT} />.{' '}
                <SpellLink spell={TALENTS.TIME_SKIP_TALENT} /> should be used to reduce the cooldown
                of your empowers, <SpellLink spell={SPELLS.FIRE_BREATH} /> and{' '}
                <SpellLink spell={SPELLS.UPHEAVAL} /> to maximize the amount of{' '}
                <SpellLink spell={SPELLS.SHIFTING_SANDS_BUFF} /> buffs you have active.
                <br />
              </p>
            )}
            <p>
              You can use the graph below to visualize your buffs:{' '}
              <SpellLink spell={SPELLS.SHIFTING_SANDS_BUFF} />,{' '}
              <SpellLink spell={TALENTS.EBON_MIGHT_TALENT} /> along with your{' '}
              <SpellLink spell={SPELLS.TEMPORAL_WOUND_DEBUFF} /> debuffs, for each individual{' '}
              <SpellLink spell={TALENTS.BREATH_OF_EONS_TALENT} /> window. Problem points such as:
              letting <SpellLink spell={TALENTS.EBON_MIGHT_TALENT} /> drop during your{' '}
              <SpellLink spell={TALENTS.BREATH_OF_EONS_TALENT} /> windows, or a mob dying before{' '}
              <SpellLink spell={SPELLS.TEMPORAL_WOUND_DEBUFF} /> runs out, will be pointed out.
            </p>
          </div>
        )) || (
          <div className="no-cast">
            <br />
            You did not cast this spell at all.
          </div>
        )}
      </div>
      {breathPerformance && (
        <div className="breath-explanation-container">
          {breathPerformance.temporalWoundsCounter.length > 0 ? (
            <table className="breath-explanations">
              <tbody>
                <tr>
                  <td>Ebon Might Uptime</td>
                  <td className="pass-fail-counts">
                    {' '}
                    {(
                      (currentWindow.end -
                        currentWindow.start -
                        breathPerformance.ebonMightDroppedDuration) /
                      1000
                    ).toFixed(1)}
                    s / {((currentWindow.end - currentWindow.start) / 1000).toFixed(1)}s
                  </td>
                  <td>
                    <PassFailBar
                      pass={
                        currentWindow.end -
                        currentWindow.start -
                        breathPerformance.ebonMightDroppedDuration
                      }
                      total={currentWindow.end - currentWindow.start}
                    />
                  </td>
                </tr>

                <tr>
                  <td>
                    <TooltipElement
                      content={t({
                        id: 'guide.augmentation.breathofeons.damage',
                        message:
                          'This value indicates the amount of damage you did, along with the potential damage you lost to mobs dying early. This value is a guesstimation and therefore not 100% accurate.',
                      })}
                    >
                      Damage
                    </TooltipElement>
                  </td>
                  <td>
                    {formatNumber(breathPerformance.damage)} /{' '}
                    {formatNumber(breathPerformance.damage + breathPerformance.potentialLostDamage)}
                  </td>
                  <td>
                    <PassFailBar
                      pass={breathPerformance.damage}
                      total={breathPerformance.damage + breathPerformance.potentialLostDamage}
                    />
                  </td>
                </tr>
              </tbody>
              <tbody>
                <tr>
                  <strong>Cast performance</strong>
                </tr>
                <tr>
                  <td>
                    <SpellLink spell={SPELLS.FIRE_BREATH} /> casts{' '}
                  </td>
                  <td>
                    {breathPerformance.fireBreaths} / {breathPerformance.possibleFireBreaths}
                  </td>
                  <td>
                    <PassFailBar
                      pass={breathPerformance.fireBreaths}
                      total={breathPerformance.possibleFireBreaths}
                    />
                  </td>
                </tr>

                <tr>
                  <td>
                    <SpellLink spell={SPELLS.UPHEAVAL} /> casts{' '}
                  </td>
                  <td>
                    {breathPerformance.upheavels} / {breathPerformance.possibleUpheavels}
                  </td>
                  <td>
                    <PassFailBar
                      pass={breathPerformance.upheavels}
                      total={breathPerformance.possibleUpheavels}
                    />
                  </td>
                </tr>
                {breathPerformance.timeskipTalented && (
                  <tr>
                    <td>
                      <SpellLink spell={TALENTS.TIME_SKIP_TALENT} /> casts{' '}
                    </td>
                    <td>
                      {breathPerformance.timeSkips} / {breathPerformance.possibleTimeSkips}
                    </td>
                    <td>
                      <PassFailBar
                        pass={breathPerformance.timeSkips}
                        total={breathPerformance.possibleTimeSkips}
                      />
                    </td>
                  </tr>
                )}
                <tr>
                  <td>Potion used </td>
                  <td>
                    {breathPerformance.potionUsed} / {breathPerformance.possiblePotions}
                  </td>
                  <td>
                    <PassFailBar
                      pass={breathPerformance.potionUsed}
                      total={breathPerformance.possiblePotions}
                    />
                  </td>
                </tr>
                {breathPerformance.possibleTrinkets >= 0 && (
                  <tr>
                    <td>Trinket used </td>
                    <td>
                      {breathPerformance.trinketUsed} / {breathPerformance.possibleTrinkets}
                    </td>
                    <td>
                      <PassFailBar
                        pass={breathPerformance.trinketUsed}
                        total={breathPerformance.possibleTrinkets}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table></table>
          )}
          <div className="graph-window-container">
            <header>
              <span>
                Breath Window: {currentWindowIndex + 1} out of {windows.length}
              </span>
              <div className="btn-group">
                <button onClick={goToPrevWindow} disabled={currentWindowIndex === 0}>
                  <span
                    className="icon-button glyphicon glyphicon-chevron-left"
                    aria-hidden="true"
                  ></span>
                </button>
                <button
                  onClick={goToNextWindow}
                  disabled={currentWindowIndex === windows.length - 1}
                >
                  <span
                    className="icon-button glyphicon glyphicon-chevron-right"
                    aria-hidden="true"
                  ></span>
                </button>
              </div>
            </header>
            {breathPerformance.temporalWoundsCounter.length > 0 ? (
              <BreathOfEonsGraph
                window={currentWindow}
                fightStartTime={fightStartTime}
                fightEndTime={fightEndTime}
                ebonMightCount={ebonMightCount}
                shiftingSandsCount={shiftingSandsCount}
              />
            ) : (
              <div>
                You failed to hit anything with your{' '}
                <SpellLink spell={TALENTS.BREATH_OF_EONS_TALENT} />!
              </div>
            )}
          </div>
        </div>
      )}
      <div className="graph-window-container">
        <header>Breath Window Helper</header>
        <p>
          <span className="currentBreath">Current Breath timing</span> -{' '}
          <span className="optimalBreath">Optimal Breath timing</span>
        </p>
        <LazyLoadGuideSection
          loader={loadData.bind(this)}
          value={findOptimalWindow.bind(this)}
          className="button"
        />
      </div>
    </SubSection>
  );
};
/**
 * So this is basicly the function where we would poke WCL for some juicy events
 * how I wanna go about it is kinda in a idk rn state of mind
 * Best way, purely visually is to bring up a graph of the buffed targets DPS over a
 * set window size (breath duration + a buffer) and see if it would have been better
 * to use it later/sooner.
 * We keep it "basic" like that since actually starting to recommend specific timings
 * or determining optimal uses throughout a fight is :KEKW: aint doing that.
 * (Although prolly should, if only for the sake of my own guilds prog :deadge:)
 *
 * Ontop of w/e that bs above is we *should* also compare against other actors
 * to see if there were more optimal targets in the given frame, but complexity ish
 *
 * Esentially the crux is how do I wanna visualize the data, because that kinda dictates
 * how I need to collect said data. If I wanna get DPS, I need to filter it which means going through individual events
 * and if I wanna show a graph that means multiple passes for every second(or even less than that idk)
 * lots of calls :)
 *
 * I think we just load data/analysis for all the graphs at the same time, making the load function a part of the
 * individual graphs feels like a lot more effort.
 *
 * 1. I need to collect the actors in each Breath window
 * 2. Get their filtered damage around the breath window
 * 3. Make a graph out of that, that visualizes an "optimal usage"
 * 4. Plop those graphs in a new array so we can plot them
 * 5. ???
 * 6. Profit
 *
 * When you lay it out like that it actually seems kinda doable.
 * Prolly just stick to only looking at the buffed players, don't
 * need to create whitelist and such then.
 */

export default BreathOfEonsSection;
